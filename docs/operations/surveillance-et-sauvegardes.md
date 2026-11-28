# Surveillance, sauvegardes hors site et garde des clés

## Ce qui est surveillé (toutes les 15 minutes)

`scripts/production/operations.mjs monitor <url> <dossier sauvegardes> <dossier état>` vérifie :

| Contrôle | Alerte si |
|---|---|
| `health` | `/api/health/ready` ne répond pas « ready » |
| `backup` | pas de sauvegarde chiffrée de moins de 26 h, empreinte fausse, ou dump en clair présent |
| `keys` | une clé **privée** age (`AGE-SECRET-KEY-…`) se trouve dans `AULIA_KEYS_DIR` ou `AULIA_SECRETS_DIR` |
| `offsite` | la dernière sauvegarde n'a pas de copie identique dans `AULIA_BACKUP_OFFSITE_DIR` |
| `disk` | moins de `AULIA_MIN_FREE_GB` (10 par défaut) Go libres |

L'état est écrit dans `operations-status.json` et `ALERTE.txt`. Si `AULIA_ALERT_WEBHOOK_URL` (HTTPS : Slack, Teams, passerelle SMS…) est défini, une alerte est envoyée à chaque échec, puis une fois au retour à la normale. Le message ne contient que le nom des contrôles en échec : aucune donnée patient, adresse, jeton ni mot de passe.

Si le serveur utilise un certificat interne, donner son autorité à Node : `NODE_EXTRA_CA_CERTS=<chemin du certificat racine>`.

## Mise en place (une fois, en administrateur)

1. Variables d'environnement machine : `AULIA_BACKUP_OFFSITE_DIR` (disque externe, NAS ou dossier synchronisé **hors du serveur**), `AULIA_KEYS_DIR`, `AULIA_SECRETS_DIR`, et si possible `AULIA_ALERT_WEBHOOK_URL`.
2. `scripts\production\register-operations-tasks.ps1` crée :
   - « Aulia Care - Sauvegarde » : chaque nuit, sauvegarde chiffrée puis `copy-backup-offsite.ps1` (copie vérifiée par empreinte) ;
   - « Aulia Care - Surveillance » : le contrôle ci-dessus toutes les 15 minutes.
3. Tester la restauration chaque mois avec `test-restore-postgres.ps1` sur une base jetable.

## Garde des clés

Le serveur n'a besoin que de la clé **publique** age (`backup-recipient.txt`) pour chiffrer. La clé **privée**, seule capable de déchiffrer, se garde hors du serveur (coffre, clé USB au coffre, gestionnaire de mots de passe de la direction), en deux exemplaires. Un serveur volé ne donne alors accès à aucune sauvegarde. La surveillance signale toute clé privée retrouvée sur le serveur.

## Serveur unique

Tant qu'il n'y a qu'un serveur, la reprise repose sur : sauvegarde nocturne + copie hors site vérifiée + restauration testée. Objectif à annoncer aux établissements : perte maximale d'une journée de saisie (RPO 24 h), remise en service en une demi-journée sur un autre poste (RTO). Les postes en mode hors ligne conservent leurs saisies en attente pendant une coupure.

## Mise à jour de Prisma

L'isolement des établissements passe par un adaptateur (`backend/src/prisma/prisma.service.ts`) qui s'appuie sur un détail interne de Prisma 5.22. Trois protections :

1. la version est figée (`5.22.0`, sans `^`) et l'API refuse de démarrer avec une autre ;
2. toute requête dont Prisma ne fournit plus l'information de transaction est refusée ;
3. au démarrage, un auto-contrôle vérifie sur la vraie base qu'une requête faite pendant une demande authentifiée s'exécute bien sous le rôle restreint `aulia_app` (requête simple, transaction groupée, transaction interactive) et que ce rôle ne fuit pas hors d'une demande. Sinon l'API refuse de démarrer.

Pour monter de version : branche dédiée, adapter l'adaptateur si besoin, puis faire passer `tenant-rls`, `core-concurrency`, `core-boundary` et l'auto-contrôle de démarrage avant de modifier la version figée.
