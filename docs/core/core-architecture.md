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

`HospitalizationsService` orchestre les règles métier. Le contexte clinique ne
doit jamais provenir d’un `clinicId`, `providerId` ou d’un lit envoyé par le
navigateur sans vérification serveur.
