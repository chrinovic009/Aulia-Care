# Preuves techniques — 19 novembre 2026
Base de départ : PR #3, commit 1c8d30bf6686916fe9b5ef00f1399b8bf2152181.
Environnement : copie isolée, Node 22, PostgreSQL 17 local, données synthétiques ; aucune installation clinique contactée.

- Audit dépendances production après correction : 0 vulnérabilité signalée. L’audit complet conserve 11 alertes modérées dans les outils de développement ; ne pas exposer le serveur de développement.
- Tests serveur : 174/174, dont 3 nouveaux tests du refus de lecture non auditée.
- Tests frontend : 11/11.
- Tests PostgreSQL/HTTP : 15/15, sans test ignoré ; migrations : 44.
- Contrôles d’exploitation : 3/3 (cible locale obligatoire, erreurs/429 comptées, sauvegarde manquante/altérée/périmée).
- Restauration PostgreSQL d’une chaîne synthétique : patient, consultation, ordonnance et lignes, facture 100, paiement 60, solde 40, stock 10, hospitalisation, migrations. Comparaison des identifiants et valeurs source/restauration : réussie.
- Charge authentifiée : médecin autorisé, lecture réelle d’un dossier synthétique et résultat relu ; 30 requêtes par niveau : p95 37 ms (1 simultané), 125 ms (10), 292 ms (30). 90 requêtes, 0 erreur et 0 réponse 429.
- Vérification TypeScript frontend avec types Node pour les tests : réussie. Pas de preuve de compilation de production serveur dans cette session.

## Limites
Ces mesures ne prouvent pas une journée clinique, des centaines de connexions ou la performance du serveur de la clinique. Le test de charge ne couvre pas les écritures multi-utilisateurs ; les tests E2E couvrent les conflits déjà prévus.
Le test synthétique PostgreSQL ne prouve pas l’exécution PowerShell/Docker/age du serveur clinique, ni la sauvegarde des pièces jointes.
Le scan Lovable de ce projet vide ne serait pas un scan du dépôt Aulia Care ; il n’a donc pas été utilisé comme preuve. L’analyse réalisée ici n’est pas un test d’intrusion indépendant.
La migration Prisma `$use`, l’harmonisation de tous les documents et les validations externes restent ouvertes.
Conclusion : corrections techniques utiles et pilote à préparer ; pas de confirmation « prêt pour une clinique réelle ».
