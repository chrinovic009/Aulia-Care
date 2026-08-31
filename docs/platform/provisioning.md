# Provisioning institutionnel

Le workflow DEV se fait dans `/dev/couches` et ne peut pas être contourné par
la création générique d’utilisateurs.

1. Le compte `DEV` crée l’identité de l’établissement.
2. Le même compte configure les couches autorisées pour cet établissement.
3. Il crée le premier `SUPER_ADMIN`, automatiquement rattaché à ce tenant.
4. Il active l’établissement.
5. Le Super Admin crée les comptes `ADMIN` de son établissement.
6. Les administrateurs créent le personnel opérationnel de ce même tenant.

Routes plateforme (compte DEV seulement) :

```text
POST  /api/platform/provisioning/clinics
GET   /api/platform/provisioning/clinics
GET   /api/platform/provisioning/clinics/:clinicId
PATCH /api/platform/provisioning/clinics/:clinicId
PUT   /api/platform/provisioning/clinics/:clinicId/layers
POST  /api/platform/provisioning/clinics/:clinicId/super-admin
POST  /api/platform/provisioning/clinics/:clinicId/activate
```

Le DEV n’acquiert aucun accès aux dossiers, factures ou hospitalisations de la
clinique provisionnée. Il ne consulte que le registre institutionnel et son
avancement.
