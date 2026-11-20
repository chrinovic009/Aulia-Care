# Core : corrections techniques du 20 novembre 2026

Base vérifiée : main, 1f2ff0b5c1cd042d04912ab72cdae748055bf9ea. Corrections conservées dans cette copie ; aucune nouvelle fusion GitHub ni installation clinique effectuée.

## Bilan des neuf points de la revue
1. La table est une projection globale, pas une autorisation médicale. Aucune exception médicale supprimée arbitrairement. Les services doivent continuer à contrôler les prérequis ; le médecin directeur peut valider les exceptions, mais leur liste et son approbation effective restent attendues.
2. Refus attribués à l’utilisateur, à son métier, ses rôles supplémentaires et l’action appelée. Les refus stricts sont réinscrits après rollback par l’intercepteur HTTP avant retour de l’erreur.
3. Core résout les rôles actifs en base ; le module directeur utilise désormais ce contrôle partagé et le relit dans sa transaction d’approbation.
4. Certification de décès passée par Core ; initialisation générique du patient contrôlée côté serveur. Rectification de la revue : abonnements et admission créent de nouveaux patients, et la pharmacie utilisait déjà Core. PostgreSQL refuse maintenant les mises à jour de statut sans marqueur Core et prend le verrou patient.
5. Ancienne API transition retirée : opérations obligatoires et projections de files distinguées. Paiements hospitaliers préservés ; notification après constantes basée sur le statut persisté.
6. Deux $use remplacés par une extension couvrant modèles et SQL brut. Prisma fixé exactement à 5.22.0 : l’adaptateur utilise son descripteur interne de transaction et refuse une version incompatible. Ce choix impose une nouvelle validation avant mise à niveau ; ce n’est pas une suppression de toute dépendance interne.
7. Capacité infirmière déplacée dans le domaine hospitalisation ; exports compatibles conservés. Périmètre de Core documenté dans AGENTS.md.
8. Classification exhaustive des rôles : un rôle nouveau exige une décision explicite ; médecin directeur reste une attribution additionnelle, pas un métier de personnel à créer.
9. Test PostgreSQL des 121 couples de statuts, écritures directes, SQL brut, transactions groupées/interactives, rollback, concurrence entre cliniques et remise à zéro du contexte. Rectification : un test de parité du texte SQL existait déjà ; le nouveau test exerce réellement la base.

## Vérification
- 210 tests unitaires serveur réussis ; dernier test de refus rejoué après correction de son type.
- 17 scénarios PostgreSQL/HTTP réussis, sans scénario ignoré, dont parcours admission → paiement → consultation → examens → pharmacie, chirurgie, finance et chaîne de confrères.
- 1 test d’intégration et 11 tests frontend réussis.
- Analyse TypeScript backend réussie avec tsgo et options Node16 adaptées à cet outil ; configuration du dépôt inchangée.
- Lint backend sans erreur ; avertissements existants non revendiqués comme corrigés.
- 48 migrations appliquées par Prisma dans une nouvelle base fictive PostgreSQL 17.12, y compris direction médicale et les deux nouvelles migrations.

## Limites et installation
- Aucun nouvel essai navigateur des écrans : la validation de cette passe est serveur/HTTP authentifiée avec données fictives, pas une vérification visuelle complète.
- PostgreSQL cible du dépôt : 16 ; essais locaux : 17.12. Le contrôle GitHub sur PostgreSQL 16 n’a pas été déclenché pour ces corrections.
- Le marqueur Core prévient les contournements accidentels ; du SQL malveillant disposant des mêmes droits peut définir un paramètre PostgreSQL. Le compte propriétaire reste réservé aux migrations/maintenance.
- Les règles médicales, la liste des exceptions et leur approbation réelle ne sont pas certifiées par ces tests. Le « Oui » confirme seulement la capacité du médecin directeur à valider.
- Livrer le code et appliquer ses migrations avant de démarrer la version corrigée sur le serveur clinique ; sauvegarder et tester la restauration avant installation.