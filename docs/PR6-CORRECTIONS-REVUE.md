# PR #6 — corrections de la revue (10 points)

Corrections techniques sur la branche `fix/core-10-faiblesses`. Elles ne valent
ni validation juridique (droit du travail RDC) ni validation médicale.

| # | Point de la revue | Correction |
|---|---|---|
| 1 | Accès patient trop large aux tables d’établissement | Un patient ne passe plus le filtre général : il lit seulement ses données, les comptes de son équipe de soins, ses messages et 4 catalogues (Service, ServiceUnit, Department, WearablePlan). |
| 2 | Aucune garde pour les futures tables | `aulia_unprotected_tenant_tables()` liste toute table avec `clinicId`/`patientId` sans RLS forcée ni politique ; le serveur refuse de démarrer. 9 tables non protégées ont été corrigées (localisations d’urgence, objets connectés, abonnements, notifications, journal d’audit). Exemption motivée : `AuditLedger` (chaîne de hachage écrite par déclencheur). |
| 3 | Soins antidatés | En ligne, l’heure du serveur fait foi. Seul un rejeu de la file hors ligne (`X-Aulia-Offline-Replay: 1`) garde l’heure de l’appareil (72 h max), avec heure de réception et marqueur hors ligne. |
| 4 | Clé des codes d’accès sans migration | Les anciens codes restent lisibles ; `npm run maintenance:reseal-access-codes -- --apply` les ré-encrypte. Clé vérifiée au démarrage. |
| 5 | Étapes de parcours sans utilisateur non journalisées | Journalisées avec l’auteur `SYSTEM`. |
| 6 | Caisse autorisée au rapprochement, contrairement à la description | Réservé à la finance et à l’administration. |
| 7 | Audits perdus après 3 échecs | Copie locale privée, rejouée au démarrage et après écriture ; visible dans `/api/health/ready` et alertée par la surveillance. |
| 8 | Garde de transaction liée aux internes Prisma | Preuve faite dans PostgreSQL (réglage local à la transaction). |
| 9 | PR trop large | Pas de réécriture de l’historique. Découpage proposé ci-dessous pour les prochaines PR. |
| 10 | Règles de paie à valider | Retenues retards/absences désactivées par défaut ; activation avec base écrite, approbateur et date ; modifier une base annule l’approbation. |

## Mise à jour d’un serveur de clinique
1. Sauvegarder base et volumes.
2. Définir `AULIA_ACCESS_CODE_KEY` (32 octets base64) dans `.env.prod` — sinon le serveur ne démarre pas en production.
3. `docker compose -f docker-compose.prod.yml up -d --build` (applique la migration `20261125090000`).
4. `npm run maintenance:reseal-access-codes` (essai), puis avec `-- --apply`.
5. Si des retenues retards/absences sont voulues : Ressources humaines → Règles → cocher et citer la base écrite.

## Découpage conseillé (point 9)
Core/sécurité · Ressources humaines · Facturation des examens d’unité · Rapports quotidiens · Terminologies (CIM-10) — une PR chacune, avec ses migrations.

## Restes ouverts
- Tables d’identité (sessions, jetons, rôles) non couvertes par la RLS : lues avant le contexte de requête.
- Validation juridique des retenues et validation médicale du codage CIM-10 : à faire par des humains qualifiés.
