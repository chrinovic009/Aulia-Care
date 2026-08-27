# Baseline Prisma Aulia Care Core

## Référence actuelle

La migration `20260826145549_init` constitue la baseline complète actuelle du
schéma Aulia Care. Elle remplace l’ancienne succession de migrations initiales
dans les nouveaux environnements.

Une base existante qui indique déjà `20260826145549_init` dans
`_prisma_migrations` ne doit **jamais** recevoir à nouveau les anciennes
migrations `20260825094052_init` et `2026082612...` à `2026082618...` : elles
rejoueraient des créations déjà présentes.

## Règle de déploiement

1. Sauvegarder la base PostgreSQL avant chaque migration de production.
2. Vérifier l’état avec `npx prisma migrate status --schema prisma/schema.prisma`.
3. Pour une nouvelle installation, appliquer uniquement la baseline et les
   migrations postérieures avec `npx prisma migrate deploy`.
4. Pour une installation historique, ne modifier le journal Prisma qu’au moyen
   d’une procédure de bascule validée et sauvegardée ; ne jamais supprimer des
   lignes de `_prisma_migrations` manuellement.
5. Toute évolution future ajoute une migration additive après la baseline ; la
   baseline ne doit plus être réécrite.

## Contrôle CI

La CI doit créer une base PostgreSQL vide, appliquer `prisma migrate deploy`,
puis lancer génération Prisma, types, tests et build. Cela garantit que le
chemin de migration versionné reste reproductible.

## État local constaté le 27 août 2026

La base PostgreSQL locale déclare la baseline `20260826145549_init` ainsi que
les migrations additives `20260827090000_security_retention_indexes` et
`20260827100000_room_orientation_assignments` appliquées. Toute revue
Git doit versionner ensemble la suppression des anciennes migrations et
l’ajout de cette baseline, dans un commit dédié, avant un nouveau déploiement.

## Décision sur `dist-frontend`

Le dépôt contient actuellement `dist-frontend`, ce qui indique qu’au moins un
mode de déploiement sert le build versionné. Il est donc conservé jusqu’à ce
qu’une procédure de livraison remplace explicitement ce mécanisme par les
artefacts CI. Les builds ne doivent pas être committés avec des changements de
fonctionnalités : les mises à jour de `dist-frontend` doivent être regroupées
dans un commit de livraison traçable après une CI verte.
