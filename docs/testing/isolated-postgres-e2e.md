# PostgreSQL E2E isolé

`npm --prefix backend run test:isolated` n'est autorisé que sur une base
PostgreSQL provisionnée séparément des environnements de développement, de
démonstration et de production.

Avant toute migration, le lanceur exige :

- `TEST_DATABASE_URL`, avec une base et un rôle PostgreSQL dédiés ;
- `AULIA_E2E_DATABASE_NAME`, préfixé par `aulia_e2e_` ;
- `AULIA_E2E_DATABASE_USER` ;
- `AULIA_E2E_DATABASE_SENTINEL`, installé par l'infrastructure dans
  `aulia.e2e_test_sentinel` ;
- `AULIA_E2E_TEST_CONFIRM=ISOLATED_POSTGRES_ONLY`.

Le lanceur ne dérive jamais la cible depuis `DATABASE_URL`. Il vérifie la base,
l'utilisateur et la sentinelle depuis la connexion Prisma effective avant de
lancer une migration ou un test. Les tests ne créent ni ne modifient la
sentinelle. Sans cette configuration, `test:e2e` échoue explicitement : une
suite ignorée ne constitue pas une preuve de validation.

L'équipe d'exploitation doit fournir une instance ou un conteneur PostgreSQL,
un rôle à privilèges minimaux et des identifiants dédiés. Un nom contenant
`e2e` n'est jamais, à lui seul, une preuve d'isolation.
