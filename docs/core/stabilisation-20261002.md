# Stabilisation Core — état vérifié le 2026-10-02

## Complément vérifié le 2026-10-06

Le travail a été poursuivi localement, sans déploiement et uniquement contre un
cluster PostgreSQL 16 jetable (`127.0.0.1:55434`). Les migrations additives
`20261006000000_medication_sale_price`,
`20261006010000_subscription_charge_provenance` et
`20261006010100_subscription_company_explicit_coverage` passent depuis une
base vide (26 migrations).

### Flux pharmacie et entreprise

- `MedicationSalePrice` sépare désormais le coût d'achat du lot et le tarif de
  vente par médicament et par clinique. Seul `ADMIN` ou `PHARMACIST` peut le
  modifier. Une ordonnance sans tarif de vente explicite est rejetée ; aucune
  facture à zéro ni prix dérivé de `purchasePrice` n'est créé.
- Les lignes de facture d'ordonnance figent le prix de vente en `Decimal` et la
  quantité. Les tests couvrent le tarif manquant et `12,35 × 3 = 37,05`.
- Une prise en charge entreprise est maintenant distinguée de l'encaissement :
  la facture source passe à `COVERED`, jamais à `PAID`, et aucun paiement
  personnel fictif n'est généré. Laboratoire, imagerie et pharmacie acceptent
  `PAID` ou `COVERED` pour l'exécution.
- Les nouveaux `SubscriptionCharge` conservent `sourceInvoiceId` de manière
  immuable et utilisent `monthlyInvoiceId` pour la consolidation. La
  consolidation ne remplace plus la provenance source. Les valeurs historiques
  de `invoiceId` restent intactes et ambiguës : aucun rapprochement automatique
  n'a été fait.
- La couverture globale est un choix explicite de contrat (`coversAllServices`,
  faux par défaut). Un employé actif sous un contrat non validé suit le circuit
  particulier. Le plafond de crédit, lorsqu'il est défini, additionne les
  charges non consolidées et les soldes des factures mensuelles avant une
  nouvelle prise en charge. Des verrous transactionnels PostgreSQL sérialisent
  cette décision et la consolidation mensuelle d'une période.
- Après une ordonnance validée, les notifications sont routées après commit vers
  la caisse ou la pharmacie, puis vers la réception lorsqu'elle est couverte.
  Une panne de diffusion n'annule pas la création clinique ou financière.

### Preuves exécutées

| Contrôle | Résultat |
| --- | --- |
| `prisma validate` backend | PASS |
| Typecheck backend | PASS |
| Build backend | PASS |
| Tests unitaires backend | PASS — 98/98 |
| Tests intégration backend | PASS — 1/1 |
| E2E HTTP/PostgreSQL backend | PASS — 10/10 |
| Audit tenant sur base fraîche | PASS — 0 anomalie |
| Build frontend Vite | PASS |
| Tests unitaires frontend | PASS — 11/11 |
| Typecheck frontend | ÉCHEC — 95 erreurs restantes sur des écrans cliniques et composants (hors dépendances absentes corrigées) |

Les deux composants de carte dépendaient d'une bibliothèque incompatible avec
React 19. Ils sont devenus des aperçus d'emplacements sans dépendance externe,
ce qui garde l'information visible et rétablit le build sans forcer un pair
dependency incompatible. Le composant de dépôt de fichiers est également
devenu natif, sans dépendance manquante.

### Limites qui empêchent encore un verdict « pilote validé »

- Le typecheck frontend est encore non nul ; il reste des contrats de données
  incohérents sur plusieurs écrans médicaux, laboratoire, téléconsultation et
  patient. Le build Vite ne remplace pas cette preuve.
- Les notifications post-commit sont best-effort. Elles ne font pas échouer le
  soin, mais il n'existe pas encore d'outbox persistante avec reprise et
  déduplication.
- Le remplacement versionné d'une ordonnance déjà facturée (avoir, complément,
  restitution et cas de dispensation partielle) reste à concevoir et à faire
  valider métier ; le blocage protecteur actuel est conservé.
- Docker n'est pas disponible dans cet environnement : aucune recette Docker,
  TLS ou navigateur de la pile restaurée n'est déclarée réussie. La migration
  sur une vraie copie historique reste également à faire après sauvegarde et
  accord explicite.

Branche locale : `codex/core-stabilisation-20261002`, issue de `feature/durcissement` à `d493455b90ebbf17fa9dc962a5c7854f7f74c111`. Aucun déploiement ni accès à la base `aulia_care` de développement n'a été effectué pour les tests de mutation : ils ont utilisé une instance PostgreSQL 16 temporaire sur `127.0.0.1:55434`, base `aulia_core_test`, initialisée en UTF-8.

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

- Typecheck frontend : échec (95 erreurs lors du dernier relevé, principalement contrats d'écrans cliniques et éléments de template). Le build Vite seul n'est pas une preuve de typage.
- Facturation médicament : un tarif de vente explicite et tenant-scopé est désormais requis et figé sur la ligne de facture. Les modifications d'ordonnances facturées restent bloquées tant qu'un workflow métier versionné (avoir, complément, restitution) n'a pas été validé et implémenté.
- Tests PostgreSQL spécifiques : la vente concurrente est couverte, mais la double délivrance, l'annulation concurrente, les remboursements et les interactions délivrance/vente ne le sont pas encore tous.
- Pas de migration sur base historique représentative, de recette navigateur, de validation HTTP de la base restaurée ni de validation Docker/TLS dans cet environnement.
- Lint backend termine avec 615 avertissements et zéro erreur ; ce n'est pas un gate de qualité suffisant pour l'usage réel.

### Relevé local du 2026-10-07

- `npm audit --omit=dev --workspace backend --workspace frontend` : **PASS, 0 vulnérabilité** après verrouillage de `proxy-addr` 2.0.8 et `engine.io` 6.6.11.
- `prisma validate`, build backend et 98 tests unitaires backend : **PASS**. Le build frontend est également **PASS**.
- Une nouvelle relance d'intégration/E2E a été tentée avec `TEST_DATABASE_URL` vers l'instance PostgreSQL isolée. Elle ne peut pas constituer une preuve ce jour : le serveur isolé était arrêté et la politique locale Windows a empêché PostgreSQL d'ouvrir son socket TCP sur `127.0.0.1:55434`. Ce n'est ni converti en PASS ni masqué ; il faudra redémarrer une instance PostgreSQL de test autorisée puis relancer ces suites.
