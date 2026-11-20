# Messagerie clinique, notes vocales, photos et PACS

## Fonctionnement commun

Toutes les pages « Messages » utilisent le même composant : texte, photo JPEG/PNG/WebP (8 Mo maximum), note vocale WebM/Ogg/M4A/WAV (12 Mo et 2 minutes maximum), lecture et accusés de lecture. Le microphone demande l’autorisation du navigateur et affiche une animation pendant l’écoute.

Les fichiers sont enregistrés hors de la racine web publique, dans `MESSAGE_MEDIA_DIR`. Chaque téléchargement repasse par l’authentification, la clinique, les participants et la relation de soins. La réponse est `private, no-store` avec `nosniff`. Le volume Docker `message-media-prod-data` conserve ces fichiers lors d’un remplacement du conteneur ; il doit être inclus dans les sauvegardes chiffrées et les exercices de restauration de la clinique.

Une photo de discussion n’est pas présentée comme une imagerie diagnostique validée.

## Partage d’une imagerie

Le partage structuré est réservé au médecin demandeur et au radiologue rattachés à l’examen. Le destinataire professionnel doit également être l’un de ces deux acteurs. Pour un patient :

- le compte destinataire doit être lié au patient de l’examen ;
- le compte rendu doit être vérifié ;
- le médecin ou le radiologue doit cocher une autorisation explicite ;
- l’auteur, l’examen, le destinataire et l’autorisation sont journalisés ;
- une ligne non autorisée est masquée dans la conversation et son fichier est refusé.

Ces contrôles techniques ne remplacent ni le consentement requis par la réglementation locale ni la validation des règles de partage par le médecin directeur.

## Deux modes PACS

### Clinique avec PACS

Renseigner hors du dépôt :

```dotenv
PACS_PREVIEW_URL_TEMPLATE=https://pacs.clinique.local/rendered/studies/{studyUid}
PACS_ACCESS_TOKEN=secret_fourni_par_le_pacs
```

Le fournisseur PACS doit offrir une URL qui produit un aperçu JPEG, PNG ou WebP pour le `StudyInstanceUID`. Le serveur refuse les redirections, les autres types de contenu, les réponses de plus de 8 Mo et les URL avec identifiants intégrés. HTTPS est obligatoire ; `PACS_ALLOW_INSECURE_HTTP=true` est uniquement un choix explicite pour un réseau local isolé.

Cette interface est un point de raccordement pour aperçus rendus, pas une certification DICOM/DICOMweb. La connectivité, le certificat, les droits et le modèle d’URL doivent être testés avec le PACS réel de chaque clinique.

### Clinique sans PACS ou fonctionnement de secours

```dotenv
PACS_PREVIEW_ROOT=/var/lib/aulia-care/pacs-previews
```

Monter ce répertoire en lecture seule pour les exports techniques existants. `ImagingReport.imagePaths` contient alors des chemins relatifs vers des aperçus JPEG/PNG/WebP. Le serveur vérifie la signature du fichier et refuse toute sortie du répertoire.

Pour le radiologue, l’ajout ne demande aucune manipulation de base : ouvrir **Radiologie → Workflow PACS / RIS → Rédiger le compte rendu**, enregistrer un brouillon, puis cliquer sur **Ajouter un aperçu**. Les images JPEG/PNG/WebP de 8 Mo maximum sont enregistrées dans `IMAGING_PREVIEW_UPLOAD_DIR`, avec un nom aléatoire et des permissions privées. Douze aperçus au maximum peuvent être rattachés ; après validation du compte rendu, son contenu et ses aperçus sont en lecture seule.

Le volume Docker `imaging-preview-prod-data` conserve ces dépôts dans `/var/lib/aulia-care/imaging-previews`. Il doit être inclus dans les sauvegardes chiffrées et les exercices de restauration. La lecture d’un aperçu exige une session autorisée dans la même clinique et est journalisée.

Sans PACS et sans aperçu local, la carte conserve la référence DICOM et le compte rendu mais indique honnêtement « Aperçu indisponible ». Si les deux modes sont configurés, le PACS distant est essayé puis l’aperçu local sert de secours. Aucun jeton n’est renvoyé au navigateur.
