# Authentification et sessions — Aulia Care Core

## Mot de passe et PIN

Le mot de passe principal est conservé uniquement dans `User.passwordHash`.
Le PIN est stocké séparément dans `User.pinHash` et sert exclusivement à
réauthentifier rapidement une session déjà ouverte (écran de verrouillage).

Lors de la première configuration du PIN, l’utilisateur confirme son mot de
passe principal généré ou choisi. Une fois le PIN créé, son remplacement exige
le PIN actuel. Le PIN est numérique, de 4 à 6 chiffres, haché avec bcrypt,
jamais retourné par l’API et jamais journalisé.

Après cinq échecs, le PIN est verrouillé quinze minutes. Les événements de
changement et de verrouillage sont enregistrés dans `AuditTrail`, sans valeur
secrète.

## Sessions

Chaque connexion crée une ligne `Session` et un identifiant de session (`sid`)
signé dans les tokens d’accès et de rafraîchissement. Seul le hash bcrypt du
refresh token est persisté.

- `POST /auth/logout` révoque uniquement la session courante.
- `POST /auth/logout-all` révoque toutes les sessions de l’utilisateur.
- Une session révoquée ou expirée invalide immédiatement son token d’accès.
- Un refresh fait tourner le refresh token et met à jour son hash.

Les tokens préexistants sans `sid` sont volontairement refusés : après la mise
à jour, chaque utilisateur doit se reconnecter.

## Verrouillage de l’interface

`SessionLock` protège l’affichage local après inactivité. Ce n’est pas une
frontière d’autorisation : le backend reste l’autorité et vérifie toujours la
session, le rôle et les règles métier.
# Authentification — garanties actuelles

`passwordHash` sert uniquement au mot de passe de connexion. `pinHash` sert uniquement au déverrouillage local et au PIN personnel ; un changement de PIN ne réécrit jamais le mot de passe.

Après cinq erreurs de PIN, le compte est verrouillé quinze minutes. Le compteur est conservé pendant le verrouillage pour l’audit, puis remis à zéro après une vérification réussie. Les mots de passe, PIN, jetons bruts et hashes ne sont jamais placés dans le journal d’audit.

Chaque JWT porte un `sid` de session. Une requête protégée est refusée si cette session a été révoquée ou expirée. La déconnexion normale révoque une seule session ; la déconnexion globale révoque les sessions actives de l’utilisateur.

La rotation de refresh token remplace le hash stocké. Sans historique des refresh tokens consommés, une détection complète de réutilisation d’un ancien refresh token n’est pas encore possible ; l’application refuse toutefois le token ancien. Une table d’historique dédiée serait nécessaire pour révoquer automatiquement la session en cas de réutilisation.
