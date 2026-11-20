# Brouillons médecin et configuration PACS — 20 novembre 2026

Corrections conservées sous `aulia-care-changes`. Non livrées sur GitHub et non déployées dans une clinique.

## Brouillons

- Diagnostic principal et hypothèses inclus dans la sauvegarde de brouillon.
- Version chargée conservée et envoyée lors des écritures ; écriture bloquée si elle n’est pas connue.
- Une actualisation ne réapplique plus le contenu serveur sur des modifications locales déjà restaurées.
- Sauvegarde automatique et copie de récupération suspendues pendant une décision de restauration.
- Abandon de restauration ferme l’éditeur ; réponses tardives de chargement ignorées.
- Reprise d’un éditeur fermé déclenche une nouvelle restauration plutôt que de conserver des changements abandonnés.

Chromium, comptes fictifs généraliste et neurologue : enregistrement, diagnostic conservé, actualisation sans perte de saisie, rechargement et reprise de la plainte modifiée réussis. Aucune erreur JavaScript observée.

## PACS

Dans l’espace **Développeur → Établissements**, sélectionner l’établissement puis **Configurer le PACS** : activer le PACS, renseigner son adresse HTTPS d’aperçu contenant `{studyUid}` et son jeton facultatif, puis enregistrer. Le jeton peut être remplacé ou supprimé ; il n’est jamais renvoyé au formulaire. Le champ est vidé après sauvegarde.

- Configuration distincte par clinique ; chiffrement AES-256-GCM lié à l’identifiant clinique, clé dérivée du secret serveur avec séparation de domaine.
- Compte DEV plateforme actif, sans rattachement clinique, vérifié côté serveur ; les médecins ne peuvent pas configurer le PACS.
- Métadonnées séparées de Clinic pour éviter une fuite via les réponses ordinaires d’identité.
- Journal d’administration sans jeton ni contenu chiffré.
- Adresse modifiée avec jeton existant : remplacement ou suppression du jeton obligatoire.
- Pas de réutilisation du jeton global d’une autre clinique sur les requêtes d’imagerie cloisonnées.
- Redirections distantes non suivies ; HTTPS requis, adresses locales de boucle et endpoint de métadonnées bloqués.
- Désactivation PACS conserve les aperçus locaux existants et ne supprime pas les dossiers médicaux.

La configuration est enregistrée, pas déclarée « connectée » sans essai réel. Le PACS doit fournir une image rendue JPEG/PNG/WebP : cette interface n’est pas un convertisseur DICOM.

## Vérifications

- 228 tests serveur et 20 tests frontend réussis.
- 3 parcours HTTP/PostgreSQL ciblés réussis : brouillons généraliste/spécialiste et configuration PACS, messagerie/imagerie, gouvernance/orientations.
- Tests HTTP : sauvegarde puis relecture des champs spécialisés, version périmée refusée avec 409, droits DEV contrôlés, jeton conservé/remplacé/supprimé et isolation de deux cliniques.
- Migrations appliquées avec Prisma sur PostgreSQL local fictif, y compris `20261120100000_clinic_pacs_configuration`.
- Contrôles TypeScript réussis avec le compilateur natif ; options compatibles Node16 pour le backend et types Node pour les tests frontend.
- Interface développeur vérifiée sur ordinateur et mobile 390 × 844, sans débordement horizontal.

## Limites et installation

La nouvelle migration et la régénération Prisma sont requises sur le serveur clinique avant utilisation. Conserver le secret serveur nécessaire au déchiffrement dans les sauvegardes sécurisées ; sa rotation nécessite un rechiffrement des jetons PACS.

Pas de PACS réel testé. Le conflit de version est vérifié par HTTP ; l’essai de deux onglets simultanés a été interrompu par les confirmations/rafraîchissements de l’interface et n’est pas revendiqué comme vérification navigateur complète. Les tests médicaux restent fictifs et ne constituent aucune approbation clinique.