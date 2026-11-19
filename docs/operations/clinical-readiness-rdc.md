# Préparation à une clinique réelle — RDC, serveur local

## Décision de mise en service
La validation technique ne vaut ni audit indépendant, ni autorisation légale, ni validation des pratiques de soin. Ne pas mettre de vrais dossiers dans un environnement de test. La direction clinique autorise un pilote seulement après les contrôles ci-dessous, avec papier ou ancien système en parallèle.

## 2. Sécurité
- Correctifs imposés : body-parser 2.4.0, multer 2.5.0, qs 6.17.1, Vite 6.4.6. Installer par `npm ci`, puis `npm audit --omit=dev`.
- La lecture d’un dossier audité est refusée si le contexte d’auteur manque ou si le journal est indisponible.
- Interdire les comptes partagés ; désactiver les comptes sortants ; verrouiller les postes ; limiter les droits administrateur.
- Ne pas exposer PostgreSQL, Redis ou les ports de développement au réseau utilisateur. HTTPS reste nécessaire sur le réseau local ; distribuer le certificat aux postes autorisés.
- Faire réaliser un test d’intrusion indépendant, incluant séparation des cliniques, accès par métier, fichiers joints, sessions, exports et postes locaux. Les scans de dépendances ne le remplacent pas.
- Le registre chaîné est résistant aux modifications applicatives, pas à un administrateur du serveur disposant de tous les privilèges. Conserver un export de contrôle protégé hors du serveur.

## 3. Sauvegardes et continuité
Les scripts PowerShell existants demandent Docker et age. Le script supprime maintenant les copies non chiffrées sur l’hôte en succès et en échec ; le test de restauration exige le checksum du fichier chiffré.

1. Générer une clé age hors du dépôt ; garder la clé privée séparément du serveur. Tester sa récupération par une deuxième personne autorisée.
2. Planifier `scripts/production/run-backup-postgres.ps1` chaque nuit dans le Planificateur de tâches, sous un compte dédié. Vérifier son code de sortie ; ne pas déduire un succès de la simple présence du fichier.
3. Conserver une copie chiffrée sur un support distinct et une autre hors du local serveur (rotation sécurisée de supports). Vérifier les checksums après copie. Le script seul ne réalise pas cette duplication.
4. La base n’inclut pas automatiquement les fichiers joints, certificats, paramètres et clés : inventorier et sauvegarder ces éléments séparément, avec contrôle de cohérence.
5. Exécuter mensuellement `test-restore-postgres.ps1` sur un ordinateur isolé. Vérifier un dossier, ses actes, paiements, stocks, permissions et journal après restauration. Une simple liste de tables n’est pas une preuve clinique complète.
6. Équiper serveur, switch et accès réseau d’un onduleur ; tester l’arrêt propre, les coupures de courant et la reprise.
7. Faire approuver perte de données maximale (RPO) et temps de reprise (RTO). Une sauvegarde quotidienne implique potentiellement presque 24 heures de perte ; aucun objectif clinique n’est garanti par le script.

Contrôle périodique, avec chemins protégés :
```text
node scripts/production/operations.mjs monitor https://adresse-locale-de-la-clinique repertoire-sauvegardes repertoire-alertes
```
Le certificat doit être reconnu : ne pas désactiver la vérification TLS. Planifier toutes les cinq minutes depuis un poste distinct du serveur. `operations-status.json` et `ALERTE.txt` contiennent uniquement l’état technique. Le code de sortie non nul doit déclencher une notification à un responsable via le dispositif choisi par la clinique. Le fichier local n’est pas une notification livrée ; si le poste de contrôle tombe lui aussi, une surveillance indépendante est indispensable.

## 4. Cadre RDC : validation à obtenir
Référence primaire : Ordonnance-loi n° 23/010 du 13 mars 2023 portant Code du numérique, publiée sur https://are.gouv.cd/download/ordonnance-loi-23-010-du-13-mars-portant-code-du-numerique/ .
Le guide Africa Data Protection mentionne aussi la décision n° 039/ARPTC/CLG/2025 ; vérifier le texte officiel applicable et l’autorité compétente à la date de mise en service. Source secondaire : https://www.africadataprotection.org/Guide_RDC_Protection_des_donnees_Africa_Data_Protection.pdf .

À faire valider par un juriste local et la direction médicale :
- responsable de traitement, finalités, catégories de données sensibles, base juridique de chaque traitement ; ne pas confondre consentement aux soins et consentement à tous les usages informatiques ;
- information du patient et représentants des mineurs, accès et rectification, traitement des demandes ;
- formalités auprès de l’autorité compétente et analyse des risques ;
- secret médical, accès nécessaires par métier, contrats de confidentialité, accès maintenance ;
- durée de conservation applicable aux dossiers, journaux et sauvegardes ; pas de suppression automatique de dossiers cliniques avant validation ;
- conduite à tenir en cas de fuite, délais et destinataires de notification ;
- transferts hors du pays, télémédecine, services externes et données qui quitteraient le serveur local.
Un hébergement local ne dispense pas de ces obligations. Aucun délai légal ni certificat de conformité n’est inventé ici.

## 5. Charge
La commande `operations.mjs load` n’accepte que localhost avec confirmation explicite :
```text
AULIA_LOAD_TEST_CONFIRM=DISPOSABLE_DATABASE_ONLY node scripts/production/operations.mjs load http://127.0.0.1:8091 10 100
```
Définir `AULIA_LOAD_TEST_PATH` et `AULIA_LOAD_TEST_COOKIE` uniquement dans l’environnement protégé pour une lecture authentifiée. Ne jamais afficher le cookie. Les seuils par défaut (p95 ≤ 1500 ms, erreur ≤ 1 %) sont des seuils techniques de test, pas une politique clinique approuvée.
Le rapport compte 429 et erreurs comme des échecs, jamais comme des succès. Ne pas supprimer le limiteur global de 120 requêtes/minute/IP : il protège le serveur. Tester plusieurs postes, une journée représentative, les écritures concurrentes et les pannes réseau sur une copie isolée du matériel cible avant de dimensionner ce limiteur.

## 6. Maintenance connue
Les quatre écrans ont désormais des contrôles d’affichage séparés : laboratoire, tableau médecin, dossier patient et consultation structurée. La logique clinique n’a pas été déplacée. Il reste des grands fichiers : découpage initial, pas refonte complète.
La facture imprimée utilise des valeurs de couleur centralisées ; d’autres documents conservent des couleurs propres. Les statuts médecin visibles ciblés ont des libellés lisibles.
Prisma 5.22 utilise encore `$use`. Aucun remplacement du mécanisme d’isolation sans tests dédiés transactionnels/RLS ; sa migration reste ouverte et ne doit pas être présentée comme terminée.

## 7. Incidents et audit
Nommer un responsable clinique, un responsable serveur et un remplaçant ; définir une permanence adaptée aux horaires de soins. Le logiciel ne fournit pas une personne d’astreinte.
En cas d’alerte : basculer au mode dégradé approuvé, vérifier réseau/alimentation/disque, conserver les preuves protégées, prévenir le responsable, ne pas réinitialiser la base. Restaurer uniquement sur un serveur isolé et vérifier avant bascule. Réconcilier les actes papier et paiements sans doublon après reprise ; le médecin autorise la sortie clinique et la caisse contrôle les paiements.
Tenir un registre d’incident (date, symptômes, impact, décisions, reprise, cause, actions). Ne pas copier les dossiers patients dans un ticket ou un canal d’alerte.

## Porte de sortie avant vrais patients
- [ ] Validation des parcours par les soignants.
- [ ] Audit indépendant accepté et risques critiques/élevés résolus.
- [ ] Installation HTTPS, droits réseau et chiffrement des disques vérifiés sur site.
- [ ] Planification réelle, copie hors serveur et restauration de tous les éléments vérifiées.
- [ ] Obligations RDC validées et formalités effectuées.
- [ ] Charge et reprise testées sur matériel cible.
- [ ] Alertes reçues par une personne désignée et incident simulé.
- [ ] Formation du personnel et procédure papier approuvées.
