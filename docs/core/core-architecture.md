# Aulia Care Core — architecture

```text
Authentification/session
        │
ClinicContext ──► Réception ─► PatientVisit ─► Facture/Paiement
        │                                  │
        ├────────────────────────────► Consultation
        │                                  ├─► Laboratoire
        │                                  ├─► Imagerie
        │                                  └─► Prescription/Pharmacie
        │
        └─► Hospitalisation ─► Lit ─► Soins infirmiers
                              └─► Planning/couverture
```

Le monolithe reste modulaire : les modules partagent PostgreSQL et Prisma, mais
les décisions d’accès sont bornées par l’établissement de l’acteur. Les
horodatages sont persistés en UTC ; les rotations sont interprétées dans le
fuseau IANA de l’établissement.

## Périmètre de la couche Core (`backend/src/core`)

| Fichier | Rôle | Dépend de la base ? |
|---|---|---|
| `patient-workflow.policy.ts` | Machine à états du parcours patient (liste explicite des passages autorisés) | Non (pur) |
| `patient-workflow.service.ts` | Applique un passage sous verrou et renvoie `applied` / `unchanged` / `blocked` / `not_found` | Oui |
| `clinic-context.service.ts` | Frontière d’établissement de l’acteur | Oui |
| `request-context*.ts` | Qui agit pendant une requête (lu par l’audit et la sécurité par ligne) | Non |
| `clinic-time.ts`, `operational-policy.ts` | Règles pures d’heure, de fuseau et de capacité | Non |
| `tenant-roles.ts`, `public-user-select.ts` | Référentiels partagés | Non |

Le Core garantit uniquement : l’isolation par établissement, le parcours
patient et l’interprétation du temps. Les règles métier (hospitalisation,
facturation, consultation…) appartiennent à leurs modules, qui **consomment** le
Core sans le redéclarer : `CoreModule` est global et exporte une seule instance
de `ClinicContextService` et `PatientWorkflowService`.

Le parcours patient est protégé deux fois : dans le code
(`ALLOWED_WORKFLOW_TRANSITIONS`) et dans la base (trigger
`patient_workflow_transition_guard`). Un test vérifie que les deux listes sont
identiques (le garde de la base s’applique au rôle restreint `aulia_app` des
requêtes ; migrations et scripts de démo tournent en propriétaire). Un passage
refusé n’est jamais annoncé comme réussi : `transitionDetailed` renvoie
`blocked`, et les notifications doivent publier `result.status`, le statut
réellement enregistré.

Le contexte clinique ne doit jamais provenir d’un `clinicId`, `providerId` ou
d’un lit envoyé par le navigateur sans vérification serveur : la stratégie JWT
relit l’utilisateur, son rôle et son établissement en base à chaque requête.
