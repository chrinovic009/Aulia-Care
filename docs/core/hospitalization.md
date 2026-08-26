# Hospitalisation — invariants Core

Une hospitalisation est créée uniquement par le médecin responsable authentifié.

- le patient, la consultation source, l’unité et le lit doivent appartenir au même établissement que le médecin ;
- le médecin vient toujours de la session, jamais du navigateur ;
- la consultation source doit appartenir au patient et au médecin ;
- un lit est réclamé par une mise à jour conditionnelle `FREE` → `OCCUPIED` dans la transaction ; une seule demande concurrente peut réussir ;
- les affectations jour/nuit sont contrôlées côté serveur avant création.

La suppression d’une hospitalisation n’est pas un moyen d’effacer un dossier clinique : les workflows de sortie et transfert conservent la traçabilité.
