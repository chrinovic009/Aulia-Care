# Catégories de services

Les catégories sont des données métier structurées. Elles ne sont jamais
déduites du nom affiché d’un service, car ce nom peut être traduit ou renommé.

| Type de département | Catégorie appliquée |
| --- | --- |
| Réception, facturation, administration | `ADMINISTRATION` |
| Laboratoire | `LABORATORY` |
| Radiologie | `IMAGING` |
| Pharmacie | `PHARMACY` |
| Médical | `CONSULTATION` |
| Soins infirmiers, chirurgie | `OTHER_CLINICAL` |

Un service rattaché à un département reçoit obligatoirement la catégorie de
ce département. Une tentative de modification incompatible est refusée par
l’API. Un service sans département doit déclarer explicitement sa catégorie.

Les unités administratives de réception ne sont donc pas interprétées comme
des destinations cliniques. Les règles de rendez-vous et de workflow utilisent
la catégorie, jamais des mots tels que « labo », « radio » ou « caisse » dans
un nom libre.

Après le déploiement de la migration
`20260914100000_service_category_explicit`, exécuter :

```text
npm --workspace backend run audit:tenant-integrity
```

L’audit signale toute unité dont la catégorie ne correspond pas à son
département ainsi que les services portant le même nom qu’une unité de leur
établissement mais ayant une catégorie divergente. Il ne modifie jamais ces
valeurs automatiquement.
