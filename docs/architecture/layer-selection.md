# Sélection des couches Aulia Care

La sélection est un paramètre **d'installation** stocké en base (`PlatformLayerConfiguration`), jamais dans `localStorage` ni dans le navigateur.

## Provisionnement initial

1. Appliquer la migration Prisma.
2. Définir temporairement dans `backend/.env` :
   - `AULIA_DEV_BOOTSTRAP_EMAIL`
   - `AULIA_DEV_BOOTSTRAP_USERNAME`
   - `AULIA_DEV_BOOTSTRAP_PASSWORD` (16 caractères minimum)
3. Exécuter une seule fois `npm run bootstrap:dev`.
4. Retirer au minimum le mot de passe d'amorçage du fichier `.env`.
5. Se connecter avec ce compte DEV et ouvrir `/dev/couches`.

Le rôle `DEV` ne peut pas être créé ni attribué par les APIs d'administration.

## Effet de la sélection

- **Core** est le socle permanent : système hospitalier local, admissions,
  soins, facturation, laboratoire, radiologie et interfaces métier.
- **AI** ajoute les capacités d'intelligence clinique prévues par le contrat,
  sans retirer aucune fonction Core.
- **Connected** ajoute les montres et soins connectés prévus par le contrat,
  sans retirer aucune fonction Core.

Le backend applique ce choix à chaque requête : appeler directement une route
IA ou Connected désactivée retourne `403`. Le frontend enlève les menus
associés. Les routes Core ne sont jamais retirées par cette sélection.

Les variables `AULIA_ENABLE_CLINICAL_AI` et `AULIA_ENABLE_CONNECTED_CARE` restent des limites physiques du serveur : une couche mise à `false` dans l'environnement ne peut pas être activée dans l'interface avant redémarrage avec le module concerné activé.

Les processus IA et Connected restent déployables séparément; leurs contrats réseau et secrets sont décrits dans `docs/architecture/independent-layers-deployment.md`.
