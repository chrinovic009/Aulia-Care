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
