# Vérification transversale complémentaire

Règles : une lecture déclarée auditée ne sort pas sans enregistrement ; une sauvegarde conservée ne doit pas rester en clair ; une alerte ne doit pas être confondue avec une notification reçue.

## Code lu maintenant
- Patients : détail `:id` ; consultations : détail et détail de brouillon ; hospitalisations : détail et timeline ; soins spécialisés : timeline patient et détail d’épisode ; sécurité clinique : synthèse patient. Les huit méthodes déclarent AuditRead, utilisent id ou patientId, et passent par le même intercepteur fermé en cas d’échec. Les paramètres configurés sont couverts par les nouveaux tests.
- Intercepteur et service de registre : attendent l’écriture avant réponse. Le service enregistre acteur, clinique, entité et route. Isolation Prisma et migration de registre chaîné lues : rôle restreint et contexte transactionnel, journal protégé contre UPDATE/DELETE/TRUNCATE applicatifs. Pas d’assurance contre un administrateur système privilégié.
- Listes de patients, files caisse/infirmier/médecin, portail, consultations/brouillons, recherches et listes hospitalières, historique de soins, listes grossesse et registre maternité : leurs contrôleurs ont été lus, mais ne déclarent pas tous un audit de lecture. Leur autorisation ne prouve pas une journalisation exhaustive. Leurs services et toutes les pages consommatrices n’ont pas été intégralement examinés ici : couverture complète non confirmée, ne pas appeler cette vérification un audit de toute l’application.
- Sauvegarde PowerShell : chiffrement age, checksum, nettoyage hôte dans finally ; nettoyage conteneur invoqué. Exécution réelle Docker/PowerShell non vérifiée. Une suppression de fichier n’est pas un effacement physique garanti : chiffrement du disque et contrôle des accès restent nécessaires.
- Lanceur planifié : appelle la sauvegarde et écrit un journal ; aucune preuve d’installation du planificateur clinique.
- Restauration PowerShell : checksum contrôlé, fichier temporaire et conteneur/volume nettoyés dans finally ; exécution réelle non vérifiée et échecs de suppression encore dépendants des permissions/matériel.
- Fixtures PostgreSQL : source/restauration synthétiques distinctes et locales ; chaîne de valeurs comparée lors de la session précédente. Aucun dossier soldé modifié.
- Surveillance : contrôlait uniquement les fichiers chiffrés et pouvait annoncer OK avec une copie en clair voisine. Corrigé : présence d’un .dump ou .dump.sha256 = alerte, même si la copie chiffrée est valide. Test exécuté.
- Charge : cible locale obligatoire, redirections refusées, erreurs et 429 comptées. Ce contrôle ne prouve pas que la cible locale est synthétique : confirmation explicite et préparation isolée restent indispensables.
- Alertes : état local et fichier écrits, pas de notification externe configurée ni personne d’astreinte fournie. Contrôle de disponibilité réel de Redis/serveur clinique non confirmé.

## Limites conservées
Audit indépendant, validation juridique RDC, installation HTTPS/chiffrement/réseau, sauvegarde des pièces jointes et copie hors serveur, restauration PowerShell/Docker/age, charge prolongée et écritures sur matériel cible, réception réelle des alertes, validation soignants et formation. Restent aussi 11 alertes modérées des outils de développement, Prisma $use et les couleurs des autres documents. Aucun test visuel authentifié complet ou compilation serveur de production n’est revendiqué.
