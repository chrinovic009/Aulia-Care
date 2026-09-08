# Mise en production Aulia Care

## Statut de cette procédure

Cette procédure est conçue pour un pilote contrôlé ou une mise en production
institutionnelle après validation locale. Elle n’autorise pas un déploiement
en HTTP, sur une adresse IP instable, ni avec des secrets de développement.

## Pré-requis réseau et TLS

1. Choisir un nom DNS institutionnel stable, par exemple
   `care.hopital.example` ou `care.hopital.local` dans un DNS interne.
2. Faire pointer ce nom vers le serveur Aulia Care, uniquement depuis le LAN
   et/ou le VPN autorisé.
3. Obtenir un certificat dont le SAN contient exactement ce nom. Pour un DNS
   interne, utiliser l’autorité de certification interne et installer sa CA
   sur les postes, tablettes et téléphones autorisés.
4. Placer les fichiers suivants, lisibles par Docker mais hors Git :

   ```text
   .secrets/tls/fullchain.pem
   .secrets/tls/privkey.pem
   ```

5. Copier `production.env.example` vers le gestionnaire de secrets choisi et
   définir `CORS_ORIGIN=https://<nom-dns-exact>`. Aucun `localhost`, adresse
   IP ou slash final n’est accepté.

`docker-compose.prod.yml` publie désormais `80` seulement pour une redirection
permanente et `443` pour le service. Le précédent port HTTP local `8081` ne
doit pas être utilisé en production. Les cookies Secure, CSRF, la caméra et
la télésanté s’appuient sur cette URL HTTPS unique.

## Secrets neufs par établissement/installation

Sur l’hôte de production protégé, générer un jeu neuf, une seule fois :

```powershell
./scripts/production/generate-production-secrets.ps1 `
  -OutputPath "$env:USERPROFILE\.aulia-care\secrets\aulia-care-prod.env"
```

Le script n’affiche aucune valeur secrète. Transférer les valeurs vers le
gestionnaire de secrets approuvé, configurer les URLs PostgreSQL/Redis avec
les mots de passe générés, puis supprimer le fichier local selon la procédure
interne. Ne jamais réutiliser ou copier les secrets de développement,
`.env.docker`, `.env.prod-test` ou d’une autre installation.

Les secrets minimums sont : PostgreSQL, Redis, les deux secrets JWT et les
trois secrets inter-services Clinical AI / Connected Care.

## Premier compte plateforme DEV en production

`bootstrap:dev` reste intentionnellement réservé à `NODE_ENV=development`.
Il ne faut jamais contourner ce contrôle.

Le seul parcours initial autorisé est hors API et à usage unique :

1. Construire les images et démarrer les services HTTPS.
2. Depuis une console d’administration contrôlée, générer le jeton et son
   hash :

   ```powershell
   docker compose --env-file .env.prod -f docker-compose.prod.yml exec backend `
     npm run generate:initial-dev-bootstrap-token
   ```

3. Placer temporairement les valeurs affichées, le mot de passe initial et
   les variables `AULIA_INITIAL_DEV_BOOTSTRAP_*` du modèle dans le gestionnaire
   de secrets. Le mot de passe doit comporter au moins 16 caractères.
4. Recréer seulement le conteneur backend pour qu’il reçoive les variables,
   puis exécuter :

   ```powershell
   docker compose --env-file .env.prod -f docker-compose.prod.yml exec backend `
     npm run bootstrap:initial-dev:production
   ```

Le script exige un jeton vérifié par bcrypt, une double confirmation explicite,
une transaction Serializable et un verrou PostgreSQL. Il échoue si un DEV
actif existe déjà et écrit une trace d’audit sans stocker le jeton ni le mot de
passe. Retirer immédiatement toutes les variables
`AULIA_INITIAL_DEV_BOOTSTRAP_*` puis recréer le backend.

## Contrats historiques sans établissement

Les contrats d’abonnement historiques sans `clinicId` restent volontairement
inaccessibles dans les vues tenant-scopées. Aucun rattachement n’est deviné.

Après avoir vérifié le contrat, l’établissement cible et l’identité du DEV
plateforme dans une procédure approuvée, l’opérateur peut effectuer une seule
réparation explicite :

```powershell
docker compose --env-file .env.prod -f docker-compose.prod.yml exec backend `
  npm run repair:subscription-company-clinic -- `
  --company-id <contrat> --clinic-id <établissement> --actor-id <dev> `
  --confirm ASSIGN_SUBSCRIPTION_COMPANY_TO_CLINIC
```

La commande refuse un écrasement, exige un DEV plateforme actif hors clinique
et produit un `AuditTrail`. Vérifier ensuite :

```powershell
docker compose --env-file .env.prod -f docker-compose.prod.yml exec backend `
  npm run audit:tenant-integrity
```

Le code de sortie doit être `0` avant de considérer l’intégrité tenant comme
validée. Les catalogues historiques qui ont encore une portée globale doivent
être inventoriés et migrés séparément, après décision métier, jamais liés à une
clinique par supposition.

## Sauvegarde et restauration prouvée

La sauvegarde existante chiffre le dump PostgreSQL avec `age`, vérifie le
catalogue PostgreSQL et crée des checksums :

```powershell
./scripts/production/run-backup-postgres.ps1
```

Tester au moins une restauration avant le pilote, dans un PostgreSQL Docker
jetable qui n’utilise jamais la base opérationnelle :

```powershell
./scripts/production/test-restore-postgres.ps1 `
  -EncryptedBackupPath .\backups\postgres\<fichier>.dump.age `
  -IdentityFile "$env:USERPROFILE\.aulia-care\keys\backup-identity.txt"
```

Le script ne touche qu’à un conteneur et un volume portant le préfixe
`aulia-care-restore-test-`, supprimés à la fin du test.

## Vérification avant ouverture aux utilisateurs

```powershell
docker compose --env-file .env.prod -f docker-compose.prod.yml config
docker compose --env-file .env.prod -f docker-compose.prod.yml build
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

Ensuite, vérifier le certificat depuis un poste utilisateur sur le DNS réel,
le parcours DEV → établissement → couches → super-admin, puis un parcours
fictif complet réception → paiement → triage → consultation → résultats →
pharmacie/hospitalisation. Les tests E2E automatisés protègent le backend,
mais ne remplacent pas cette recette manuelle par rôle et par écran.

Pour le poste de développement, la commande ci-dessous dérive exclusivement
la base `aulia_care_e2e` depuis `aulia_care` et refuse toute autre source :

```powershell
docker compose --env-file .env.docker exec backend npm run test:isolated
```

## Verdict professionnel

Après l’application des migrations, un audit tenant à zéro anomalie, une
restauration réellement testée, un certificat reconnu et une recette pilote
réussie avec données fictives, le statut approprié est **pilote contrôlé
prêt**. Il ne devient pas « production hospitalière prête » tant que les
données historiques non rattachées, les catalogues à portée indéterminée et
la recette manuelle de tous les rôles ne sont pas clôturés.
