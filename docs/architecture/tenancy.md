# Multi-établissement Aulia Care

`Clinic.id` est l’identifiant tenant immuable d’un établissement. Son nom,
logo, adresse, timezone et branding peuvent évoluer ; son identifiant et les
rattachements qui en dépendent ne changent jamais.

## Hiérarchie institutionnelle

```text
DEV (plateforme, sans clinicId)
  -> Clinic (tenant)
    -> PlatformLayerConfiguration (licences de ce tenant)
      -> SUPER_ADMIN (clinicId imposé)
        -> ADMIN (même clinicId imposé)
          -> personnel opérationnel + Employee (même clinicId imposé)
```

Le navigateur ne choisit jamais un `clinicId` pour une création de compte.
Chaque valeur vient du compte authentifié ou du workflow de provisioning DEV.

## Invariants

- `DEV` est le seul rôle plateforme admis sans `clinicId`.
- Tout rôle opérationnel, y compris `SUPER_ADMIN`, `ADMIN` et les patients,
  doit avoir un `clinicId`.
- Quand un `Employee` possède un `userId`, son `clinicId` est identique à celui
  du `User`.
- Une absence de tenant bloque une action ; elle ne retire jamais un filtre.
- Départements, unités, salles et affectations de salle sont contrôlés dans la
  clinique de l’acteur.
- Une licence AI ou Connected est lue par `clinicId`, jamais globalement.

## Données historiques

`npm run audit:tenant-integrity` ne modifie rien et retourne un code non nul
s’il détecte une anomalie. `npm run repair:tenant-integrity` ne répare que les
cas déterministes : un côté de la relation User/Employee connaît déjà le tenant
et l’autre non. Les conflits et comptes totalement détachés restent visibles
pour une décision humaine.
