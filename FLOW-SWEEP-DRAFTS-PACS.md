# Vérification transversale

Règles : un brouillon doit conserver la saisie du médecin sans écraser une version plus récente ; un aperçu doit utiliser uniquement la configuration PACS de sa clinique, et les images ajoutées localement restent accessibles sans PACS.

Code lu :
- Consultation généraliste/spécialiste, copie session et sauvegarde sur masquage : protections de reprise et version corrigées.
- Passage en téléconsultation : ajouté le même blocage avant restauration/version connue.
- Liste Brouillons : seuls les brouillons propres sont proposés en écriture, ceux des autres médecins en lecture seule.
- Avis spécialisés : ouvre une consultation destinataire distincte dans le même éditeur protégé ; source en lecture seule.
- Signature et avenant serveur : signature attestée, version/statut atomiques ; aucun dossier signé réécrit par cette correction.
- Transcription télésanté : consentement requis, fusion de transcription et prédicat version/statut, refus sur consultation finalisée.
- Diagnostic Agent : propositions retournées sans écriture automatique dans le dossier.
- Hospitalisation : modifie seulement le lien et la version des consultations ouvertes, sans réécrire leur contenu.
- Archivage médecin/administration : prédicats version/statut, pas de suppression de dossier signé.
- PACS développeur : réglages propres à la clinique, jeton masqué et droits serveur contrôlés.
- Messagerie médecin/radiologue/patient : configuration résolue après contrôle du participant et des autorisations de partage.
- Aperçu local de compte rendu : stockage privé existant ; corrigé le lecteur de messagerie pour qu’il lise aussi ce dossier lorsque le PACS est absent.

Exécuté : sauvegarde/relecture généraliste et neurologue dans Chromium, actualisation sans perte, configuration PACS dans Chromium ordinateur/mobile ; tests HTTP de conflit/version, accès et isolation. Code des autres chemins lu, sans revendiquer leur vérification exhaustive à l’écran.

Limites maintenues : PACS réel, déploiement/migration clinique, microphone physique et conflit navigateur à deux onglets non validés. Aucun paiement, message déjà envoyé ou dossier clôturé modifié.