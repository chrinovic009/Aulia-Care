# Vérification Messages vocaux, photos et imagerie — 20 novembre 2026

Base : `main` distant `3344b4de21ca25c3cd5c53176103643e07cd6b19`.
État : corrections conservées localement dans `aulia-care-changes/` ; aucune livraison GitHub, fusion ou installation clinique effectuée dans cette passe.

## Résultats techniques

- 223 tests unitaires backend réussis.
- 18 fichiers de parcours HTTP/PostgreSQL réussis, dont le nouveau scénario complet `messages-media.http.e2e.test.ts`.
- 16 tests frontend réussis.
- Typage TypeScript backend et frontend réussi ; compilation frontend de production réussie.
- 49 migrations Prisma appliquées sur une base PostgreSQL fictive, dont `20261120090000_secure_message_media`.
- Lint ciblé : aucune erreur ; seulement des avertissements de typage `any` dans du code existant et des doubles de test.
- Parcours navigateur réel avec micro simulé par Chromium : animation « Écoute… », enregistrement et envoi vocal, envoi et affichage photo, partage PACS, lecture du compte rendu.
- Rendus vérifiés à 1280 × 1800 et 390 × 844 : micro visible, aucune erreur JavaScript, aucun débordement horizontal ou de carte multimédia.

## Protections vérifiées

- Formats et tailles contrôlés par le serveur ; durée vocale limitée à 120 secondes.
- Fichiers privés hors racine publique, autorisations revérifiées à chaque lecture et téléchargement journalisé.
- Patient autorisé uniquement pour son propre dossier, après compte rendu vérifié et partage explicite du demandeur ou radiologue.
- Échange professionnel limité au médecin demandeur et au radiologue de l’examen.
- Aucun chemin de stockage interne exposé dans les réponses API.
- Les sockets existants authentifiés diffusent les nouveaux médias ; la liste des discussions affiche leur aperçu.

## Deux modes PACS

- Avec PACS : URL d’aperçu HTTPS configurée par étude, jeton optionnel, redirections refusées et contenu image validé.
- Sans PACS : aperçus locaux en lecture seule, ou carte DICOM/compte rendu sans image si aucun aperçu n’est configuré.
- Les photos et fichiers sont persistés dans un volume local Docker documenté.

## Limites

- Aucun serveur PACS réel n’a été connecté : compatibilité et identifiants du fournisseur restent à tester sur site.
- Le microphone physique, les permissions d’un téléphone réel et la lecture sonore par un utilisateur restent à valider ; Chromium a fourni un flux audio synthétique.
- Les 141 autres interfaces n’ont pas été re-testées visuellement dans cette passe ; le composant Messages partagé et le portail patient ont été contrôlés par les tests ciblés.
- La migration et le volume de médias doivent être appliqués lors du déploiement, avec sauvegarde préalable.
