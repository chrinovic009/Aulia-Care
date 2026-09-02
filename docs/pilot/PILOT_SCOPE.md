
# AULIA CARE — PILOT-1 SCOPE

## 1. Objet

Ce document définit le périmètre fonctionnel officiel de :

**AULIA CARE PILOT-1**

Tout workflow inclus dans ce document doit être démontré comme fonctionnel, stable, sécurisé et reproductible avant le lancement du premier établissement pilote.

Tout élément non inclus dans ce périmètre est considéré comme hors scope et doit être placé dans le backlog POST-PILOT, sauf reclassification formelle.

---

## 2. Principe de validation

Chaque workflow possède :

- un identifiant ;
- un objectif métier ;
- les acteurs concernés ;
- des préconditions ;
- un scénario principal ;
- des cas d’échec importants ;
- un critère PASS ;
- un critère FAIL ;
- une priorité ;
- une preuve attendue.

Un workflow ne peut être déclaré validé sur la base d’une simple vérification visuelle ou d’un comportement observé une seule fois.

---

# 3. WORKFLOWS DU PILOT-1

## AC-W001 — Authentification utilisateur

### Objectif

Permettre à un utilisateur autorisé d’accéder à Aulia Care avec son identité et son rôle.

### Acteurs

- administrateur ;
- réceptionniste ;
- médecin ;
- infirmier ;
- caissier ;
- tout autre rôle inclus dans le pilote.

### Préconditions

- établissement actif ;
- utilisateur actif ;
- rôle attribué ;
- identifiants valides.

### Scénario principal

1. L’utilisateur ouvre l’application.
2. Il saisit ses identifiants.
3. Aulia Care vérifie son identité.
4. Une session valide est créée.
5. L’utilisateur accède uniquement aux fonctions autorisées par son rôle.

### Cas importants à tester

- mauvais mot de passe ;
- utilisateur inexistant ;
- utilisateur désactivé ;
- token expiré ;
- refresh token invalide ;
- tentative d’accès à une route interdite.

### PASS

- authentification correcte ;
- refus des identifiants invalides ;
- session correctement créée ;
- permissions respectées ;
- aucune donnée sensible exposée dans les erreurs.

### FAIL

- connexion possible avec identifiants invalides ;
- utilisateur désactivé accepté ;
- accès à une fonction interdite ;
- token invalide accepté.

### Priorité

P0 — Critical

---

## AC-W002 — Création d’un patient

### Objectif

Créer correctement un patient au sein d’un établissement.

### Acteur principal

Réception / personnel autorisé.

### Préconditions

- utilisateur authentifié ;
- établissement actif ;
- permission de création patient.

### Scénario principal

1. L’utilisateur ouvre le module patient.
2. Il choisit de créer un patient.
3. Il saisit les informations nécessaires.
4. Les données sont validées.
5. Le patient est créé.
6. Un identifiant patient unique est associé.
7. Le patient devient immédiatement accessible dans son établissement.

### PASS

- patient créé avec données valides ;
- données obligatoires contrôlées ;
- patient rattaché au bon tenant ;
- patient retrouvable après création ;
- aucune donnée du patient visible depuis un autre tenant.

### FAIL

- création avec données obligatoires invalides ;
- mauvais tenant associé ;
- duplication incorrecte ;
- patient introuvable après création.

### Priorité

P0 — Critical

---

## AC-W003 — Recherche et consultation du patient

### Objectif

Permettre au personnel autorisé de retrouver rapidement un patient.

### Scénario principal

1. Recherche par identifiant ou information disponible.
2. Résultats limités au tenant courant.
3. Ouverture du dossier.
4. Consultation des informations autorisées.

### PASS

- patient correct retourné ;
- résultats cohérents ;
- aucun patient d’un autre tenant ;
- temps de réponse acceptable.

### FAIL

- patient du mauvais établissement visible ;
- erreur serveur ;
- résultats incohérents ;
- informations sensibles accessibles à un rôle non autorisé.

### Priorité

P0 — Critical

---

## AC-W004 — Création d’une consultation

### Objectif

Créer une consultation liée au bon patient et au bon établissement.

### Acteurs

- médecin ;
- personnel clinique autorisé.

### Préconditions

- patient existant ;
- utilisateur autorisé ;
- tenant actif.

### Scénario principal

1. Ouverture du dossier patient.
2. Création d’une nouvelle consultation.
3. Saisie des informations cliniques prévues dans le PILOT-1.
4. Enregistrement.
5. Consultation rattachée au patient.
6. Consultation visible dans son historique.

### PASS

- consultation enregistrée ;
- relation patient correcte ;
- auteur identifié ;
- tenant correct ;
- historique cohérent.

### FAIL

- consultation orpheline ;
- mauvais patient ;
- mauvais tenant ;
- perte de données après sauvegarde.

### Priorité

P0 — Critical

---

## AC-W005 — Prescription

### Objectif

Permettre au praticien autorisé de créer une prescription liée à une consultation.

### Scénario principal

1. Consultation active.
2. Création d’une prescription.
3. Ajout des éléments nécessaires.
4. Validation.
5. Prescription rattachée à la consultation et au patient.

### PASS

- prescription sauvegardée ;
- relations correctes ;
- auteur identifié ;
- tenant correct ;
- consultation et patient cohérents.

### FAIL

- prescription associée au mauvais patient ;
- prescription visible depuis un autre tenant ;
- perte ou duplication incohérente.

### Priorité

P0 — Critical

---

## AC-W006 — Demande d’examen

### Objectif

Créer une demande d’examen liée au patient et à la consultation.

### PASS

- examen correctement créé ;
- patient correct ;
- consultation correcte ;
- tenant correct ;
- statut cohérent.

### FAIL

- mauvaise association ;
- fuite inter-tenant ;
- statut impossible ou incohérent.

### Priorité

P0 — Critical

---

## AC-W007 — Facturation

### Objectif

Transformer les actes facturables du parcours patient en facture cohérente.

### Acteur

Personnel de facturation / caisse.

### Préconditions

- patient existant ;
- éléments facturables disponibles ;
- permissions suffisantes.

### Scénario principal

1. Ouverture du dossier ou épisode concerné.
2. Génération ou création de la facture.
3. Calcul des éléments facturables.
4. Vérification du montant.
5. Validation.

### PASS

- facture liée au bon patient ;
- tenant correct ;
- calcul cohérent ;
- statut valide ;
- aucune facture d’un autre tenant accessible.

### FAIL

- mauvais montant ;
- mauvaise relation patient ;
- facture du mauvais établissement ;
- doublon injustifié.

### Priorité

P0 — Critical

---

## AC-W008 — Paiement

### Objectif

Enregistrer correctement un paiement sur une facture.

### Scénario principal

1. Sélection de la facture.
2. Enregistrement du paiement.
3. Mise à jour du solde.
4. Mise à jour du statut de la facture.
5. Conservation d’une trace de l’opération.

### PASS

- paiement correctement enregistré ;
- montant exact ;
- facture mise à jour ;
- audit disponible ;
- aucun paiement appliqué au mauvais tenant.

### FAIL

- double paiement non contrôlé ;
- montant incorrect ;
- facture incorrecte ;
- état financier incohérent.

### Priorité

P0 — Critical

---

## AC-W009 — Consultation de l’historique patient

### Objectif

Afficher un historique cohérent du parcours patient.

### Doit inclure selon disponibilité dans le produit

- consultations ;
- prescriptions ;
- examens ;
- factures ;
- paiements ;
- autres événements inclus dans le PILOT-1.

### PASS

- historique chronologique et cohérent ;
- relations correctes ;
- permissions respectées ;
- aucune donnée étrangère au tenant.

### FAIL

- données manquantes sans raison ;
- mélange de patients ;
- fuite inter-tenant ;
- incohérences de relations.

### Priorité

P1 — High

---

# 4. WORKFLOWS D’ADMINISTRATION INDISPENSABLES

## AC-W010 — Création d’un établissement

### Objectif

Créer et initialiser un tenant utilisable.

### PASS

- établissement créé ;
- identifiant tenant unique ;
- configuration initiale cohérente ;
- isolation active.

### Priorité

P0 — Critical

---

## AC-W011 — Création du premier administrateur

### Objectif

Permettre à un établissement nouvellement créé de disposer d’un administrateur fonctionnel.

### PASS

- utilisateur créé ;
- rôle admin correct ;
- tenant correct ;
- authentification fonctionnelle.

### Priorité

P0 — Critical

---

## AC-W012 — Gestion des utilisateurs et rôles

### Objectif

Permettre à l’administrateur autorisé de gérer les utilisateurs du tenant.

### Tester

- création ;
- modification ;
- désactivation ;
- attribution de rôle ;
- tentative de modification d’un autre tenant.

### PASS

- permissions respectées ;
- tenant respecté ;
- utilisateur désactivé effectivement bloqué.

### Priorité

P0 — Critical

---

# 5. WORKFLOWS TECHNIQUES OBLIGATOIRES

## AC-W013 — Isolation multi-tenant

### Objectif

Garantir qu’aucun tenant ne peut accéder aux données d’un autre tenant.

### Tester

- patients ;
- utilisateurs ;
- consultations ;
- prescriptions ;
- examens ;
- factures ;
- paiements ;
- WebSocket ;
- exports ;
- accès par ID direct ;
- accès indirects.

### PASS

Aucune fuite inter-tenant détectée.

### FAIL

Une seule donnée d’un tenant accessible depuis un autre tenant.

### Priorité

P0 — Critical

---

## AC-W014 — Sauvegarde

### PASS

- dump créé ;
- dump valide ;
- checksum créé ;
- chiffrement réussi ;
- fichier sauvegarde exploitable.

### Priorité

P0 — Critical

---

## AC-W015 — Restauration

### PASS

- restauration sur base indépendante ;
- données cohérentes ;
- migrations cohérentes ;
- relations conservées ;
- données vérifiées.

### Priorité

P0 — Critical

---

## AC-W016 — Health checks

### PASS

- backend ;
- PostgreSQL ;
- Redis ;
- services applicatifs critiques ;

peuvent être contrôlés automatiquement.

### Priorité

P0 — Critical

---

## AC-W017 — Graceful shutdown

### PASS

Lors de l’arrêt :

- requêtes en cours correctement terminées ou interrompues proprement ;
- connexions libérées ;
- sortie contrôlée ;
- pas de corruption de données.

### Priorité

P1 — High

---

## AC-W018 — Migration de base de données

### PASS

Sur une base compatible :

1. migration exécutée ;
2. application démarre ;
3. données existantes préservées ;
4. nouveau schéma fonctionnel.

### Priorité

P0 — Critical

---

# 6. WORKFLOWS HORS SCOPE

Toute fonctionnalité qui ne contribue pas directement aux workflows précédents est hors scope jusqu’à décision contraire.

Les fonctionnalités hors scope doivent être ajoutées à :

`POST_PILOT_BACKLOG.md`

L’existence d’une fonctionnalité dans le code ne signifie pas automatiquement qu’elle appartient au PILOT-1.

---

# 7. MATRICE DE VALIDATION

| ID      | Workflow                 | Priorité | Statut                         |
| ------- | ------------------------ | --------- | ------------------------------ |
| AC-W001 | Authentification         | P0        | NOT TESTED                     |
| AC-W002 | Création patient        | P0        | NOT TESTED                     |
| AC-W003 | Recherche patient        | P0        | NOT TESTED                     |
| AC-W004 | Consultation             | P0        | NOT TESTED                     |
| AC-W005 | Prescription             | P0        | NOT TESTED                     |
| AC-W006 | Examen                   | P0        | NOT TESTED                     |
| AC-W007 | Facturation              | P0        | NOT TESTED                     |
| AC-W008 | Paiement                 | P0        | NOT TESTED                     |
| AC-W009 | Historique patient       | P1        | NOT TESTED                     |
| AC-W010 | Création établissement | P0        | NOT TESTED                     |
| AC-W011 | Premier administrateur   | P0        | NOT TESTED                     |
| AC-W012 | Utilisateurs / rôles    | P0        | NOT TESTED                     |
| AC-W013 | Tenant isolation         | P0        | NOT TESTED                     |
| AC-W014 | Backup                   | P0        | PASS — preuve à référencer |
| AC-W015 | Restore                  | P0        | PASS — preuve à référencer |
| AC-W016 | Health checks            | P0        | PASS — preuve à référencer |
| AC-W017 | Graceful shutdown        | P1        | PASS — preuve à référencer |
| AC-W018 | DB migrations            | P0        | PASS — preuve à référencer |

---

# 8. RÈGLE DE GO / NO-GO

Le PILOT-1 ne peut pas être déclaré prêt si :

- un workflow P0 est FAIL ;
- un défaut critique de sécurité est ouvert ;
- une fuite inter-tenant est détectée ;
- backup ou restore ne sont pas opérationnels ;
- la CI principale est rouge ;
- l’installation ne peut pas être reproduite ;
- un workflow métier central ne peut pas être exécuté de bout en bout.

---

# 9. WORKFLOW MÉTIER DE RÉFÉRENCE

Le scénario de référence du PILOT-1 est :

**Création établissement
→ création administrateur
→ création utilisateur
→ authentification
→ création patient
→ consultation
→ prescription ou examen
→ facturation
→ paiement
→ consultation de l’historique patient
→ sauvegarde
→ restauration**

Ce workflow constitue le principal scénario E2E métier du PILOT-1.

---

# 10. STATUT DU DOCUMENT

**AULIA CARE PILOT-1 : SCOPE DEFINED**

La validation technique de chaque workflow reste soumise aux preuves prévues dans la feuille de route.
