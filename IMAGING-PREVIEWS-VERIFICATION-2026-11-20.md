# Vérification du bouton « Ajouter un aperçu » — 20 novembre 2026

État : fichiers conservés localement dans `aulia-care-changes/` ; aucune livraison GitHub ni installation clinique effectuée. Aucune migration de schéma n’est nécessaire.

## Fonctionnement vérifié

- Nouvel écran dans **Radiologie → Workflow PACS / RIS** pour rédiger, reprendre ou consulter un compte rendu.
- Enregistrement obligatoire d’un brouillon avant le premier aperçu.
- Bouton **Ajouter un aperçu** pour JPEG, PNG et WebP, 8 Mo maximum par image et 12 images au maximum.
- Affichage authentifié des images dans le compte rendu ; lecture journalisée et fichiers privés hors racine web.
- Ajout réservé au radiologue de la clinique, examen payé ; accès en lecture limité aux rôles d’imagerie déjà autorisés dans cette clinique.
- Verrouillage du contenu et des aperçus après validation du compte rendu.
- Volume Docker persistant `imaging-preview-prod-data`, à inclure dans les sauvegardes chiffrées.

## Résultats

- 224 tests unitaires backend réussis.
- 18 fichiers de parcours HTTP/PostgreSQL réussis, dont dépôt, lecture, refus médecin au dépôt, refus patient direct et refus après validation.
- 18 tests frontend réussis, dont conservation d’une fenêtre clinique lors d’une notification temps réel.
- Typage backend et frontend, lint ciblé et compilation de production réussis.
- Chromium : brouillon enregistré, bouton activé, image PNG affichée avec largeur naturelle 640, compte rendu validé, bouton et champs verrouillés.
- Rendus ordinateur et mobile 390 × 844 sans débordement ni erreur JavaScript.

## Correction associée

Les notifications temps réel ne recréent plus une page lorsqu’une fenêtre clinique est ouverte, même si le focus est sur un bouton ou le sélecteur de fichier. La saisie et le compte rendu restent ainsi ouverts après le dépôt.

## Limites

Les fichiers et le parcours ont été testés uniquement avec des données fictives locales. Le bouton ne convertit pas un DICOM brut en image et ne remplace pas la validation médicale du radiologue. Un PACS réel, un téléphone physique, la sauvegarde/restauration du nouveau volume et le déploiement sur le serveur de la clinique restent à vérifier.
