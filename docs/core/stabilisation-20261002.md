# Stabilisation Core — état vérifié le 2026-10-02

Branche locale : `codex/core-stabilisation-20261002`, issue de `feature/durcissement` à `6ab45dce0a2a667d7eeb1747cd8bbf045be90e63`. Aucun déploiement ni accès à la base `aulia_care` de développement n'a été effectué pour les tests de mutation : ils ont utilisé une instance PostgreSQL 16 temporaire sur `127.0.0.1:55433`, base `aulia_core_test`, initialisée en UTF-8.

## Corrections prouvées

- Les refresh JWT sont identifiés par un `jti` unique, enregistrés sous empreinte SHA-256 du token complet et consommés par une mutation conditionnelle transactionnelle. Une réutilisation confirmée révoque la session. Les anciennes sessions avec empreinte bcrypt exigent une reconnexion. Le frontend sérialise ses refresh ordinaires.
- Les réponses Core Prisma ciblées sélectionnent explicitement les champs publics des utilisateurs imbriqués (dont laboratoire, hospitalisation, ordonnance et chirurgie). Le parcours de test ne remplace pas encore un audit de toutes les réponses, exports et événements.
- Les sorties de stock des ventes et délivrances verrouillent les lots, consomment FEFO et enregistrent les mouvements dans la même transaction. Les lots sans date d'expiration ou expirés ne sont pas délivrables. Les nouveaux mouvements de délivrance portent un `pharmacyDispenseId`, utilisé pour une restitution exacte. Les anciens mouvements non liés ne sont pas annulés automatiquement : rapprochement humain requis.
- Les nouveaux liens facture–ordonnance sont structurés (`Invoice.prescriptionId`, `prescriptionVersion`). Une ordonnance déjà facturée est refusée à la modification ; le remplacement clinique et financier (avoir/complément) reste à concevoir. Aucune facture ni paiement historiques ne sont réécrits.
- Un compte rendu d'imagerie vérifié ne peut plus être réécrit. Un radiologue peut ajouter un avenant motivé et versionné ; le contenu vérifié d'origine reste conservé. Les avenants sont tenant-scopés et visibles avec le rapport.
- L'administration infirmière accepte les prescriptions `DISPENSED` encore actives, avec patient et clinique concordants.
- Le vrai typecheck frontend compile maintenant `tsconfig.app.json` et `tsconfig.node.json`. Il révèle une dette préexistante ; sa sortie non nulle est conservée. La déclaration SVGR `?react` manquante a été ajoutée.

## Démarrer seulement Core (développement)

Dans PowerShell à la racine, avec Docker disponible et une `.env.docker` locale valide :

```powershell
$env:AULIA_ENABLE_DIAGNOSTIC_AGENT = 'false'
$env:AULIA_ENABLE_CONNECTED_CARE = 'false'
docker compose --env-file .env.docker up -d postgres redis backend frontend
docker compose --env-file .env.docker ps
```

Les deux flags sont passés explicitement au processus backend par Compose et lus avant la construction d'`AppModule`. Ne lancez pas `diagnostic-agent` ni `connected-care` dans ce mode. Vérifiez l'accès, puis testez les parcours Core avec des données fictives. Cette procédure Compose n'a pas pu être exécutée dans l'environnement de cet audit : la commande `docker` n'est pas installée dans son PATH.

Le cache PWA peut fournir des assets déjà mis en cache ; il **ne synchronise pas** les opérations médicales hors ligne. Sans Internet mais avec LAN/serveur local, seuls les services localement accessibles continuent. Sans LAN ou sans serveur, les mutations patient, caisse et stock ne doivent pas être considérées comme enregistrées.

## Données anciennes et déploiement

Les trois migrations additives `20261002000000`, `20261002000001` et `20261002000002` ont passé `prisma migrate deploy` sur une base vierge jetable. Une sauvegarde `pg_dump -Fc` du jeu synthétique a pris 0,57 s et sa restauration isolée `pg_restore` 5,38 s. `verify-core-backup-restore.ts` a confirmé l'égalité des identifiants et relations Clinic–Patient–Consultation–Prescription–Invoice–Payment, du solde (100/60/40), du lot (10), de l'hospitalisation et des 23 migrations. Ce sont des durées observées localement, pas des promesses RPO/RTO. La migration depuis un état antérieur représentatif et l'utilisation HTTP de l'application restaurée restent non prouvées. Avant toute application sur une installation réelle : sauvegarde vérifiée, restauration isolée, audit tenant, puis migration et comparaison des relations. Les factures d'ordonnance anciennes gardent `prescriptionId = NULL` ; une recherche de l'ancien marqueur exact protège le parcours de modification mais le rattachement historique reste à auditer, sans rapprochement automatique. Les sessions refresh bcrypt anciennes devront se reconnecter.

## Gates encore ouverts — verdict : bloqué pour pilote

- Typecheck frontend : échec (159 erreurs lors du relevé, principalement contrats d'écrans cliniques et éléments de template). Le build Vite seul n'est pas une preuve de typage.
- Facturation médicament : le prix de vente est encore déduit du coût d'achat du lot. Aucun tarif de vente institutionnel dédié n'est prouvé. Les modifications d'ordonnances facturées sont bloquées, faute de workflow de remplacement/avoir.
- Tests PostgreSQL spécifiques : la vente concurrente est couverte, mais la double délivrance, l'annulation concurrente, les remboursements et les interactions délivrance/vente ne le sont pas encore tous.
- Pas de migration sur base historique représentative, de recette navigateur, de validation HTTP de la base restaurée ni de validation Docker/TLS dans cet environnement.
- Lint backend termine avec 615 avertissements et zéro erreur ; ce n'est pas un gate de qualité suffisant pour l'usage réel.
