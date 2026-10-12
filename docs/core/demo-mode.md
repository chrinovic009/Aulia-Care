# Mode public Core - demonstration

Le mode DEMO execute le vrai Core avec des donnees fictives. Il n'est jamais une
installation clinique et ne doit jamais partager une instance PostgreSQL, un
role PostgreSQL ou des identifiants avec une installation reelle.

## Frontiere PostgreSQL obligatoire

Avant toute migration ou seed, un administrateur PostgreSQL doit creer :

- un conteneur ou une instance dediee a la DEMO ;
- une base dediee ;
- un role LOGIN NOINHERIT dedie, avec les seuls droits sur cette base ;
- un marqueur aleatoire stocke dans cette base via le parametre PostgreSQL
  aulia.demo_seed_sentinel.

Le role DEMO ne doit avoir aucun privilege CONNECT, USAGE, CREATE, ni
propriete sur une autre base. L'acces reseau de cette instance doit etre limite
au reverse proxy et aux operateurs autorises.

Le seed exige simultanement AULIA_APP_MODE=demo,
AULIA_DEMO_SEED_CONFIRM=true, AULIA_DEMO_PASSWORD d'au moins 16 caracteres,
AULIA_DEMO_DATABASE_NAME, AULIA_DEMO_DATABASE_USER et
AULIA_DEMO_DATABASE_SENTINEL. DATABASE_URL doit correspondre exactement au nom
de base et a l'utilisateur declares.

Avant toute ecriture, le seed interroge la connexion Prisma effective avec
current_database(), current_user et current_setting(...). Une URL declarative
DEMO ne peut donc pas valider un client Prisma connecte a une autre base. Lors
de sa premiere execution, le seed refuse toute donnee metier preexistante
(cliniques, utilisateurs, patients, personnel, rendez-vous, consultations,
laboratoire, ordonnances, factures, paiements et hospitalisations). Lors des
executions suivantes, il exige egalement le marqueur explicite de sa propre
clinique fictive : ni son nom ni les identifiants DEMO ne suffisent comme
preuve de provenance.

## Preparation

Les commandes SQL suivantes doivent etre executees uniquement par
l'administrateur de l'instance PostgreSQL DEMO, jamais sur une instance reelle :

    CREATE ROLE aulia_demo_runtime LOGIN NOINHERIT PASSWORD '<secret>';
    CREATE DATABASE aulia_core_demo OWNER aulia_demo_runtime;
    REVOKE ALL ON DATABASE aulia_core_demo FROM PUBLIC;
    ALTER DATABASE aulia_core_demo SET aulia.demo_seed_sentinel = '<secret-distinct>';

Restreindre ensuite les privileges de schema au seul role DEMO, configurer les
secrets dans le gestionnaire de secrets de l'environnement et ne jamais les
commiter.

Une fois les migrations appliquees a cette base vide :

Le seed DEMO ne cree ni ne modifie les roles canoniques ni les referentiels
globaux. Provisionner ces references avec le mecanisme d'installation controle
avant le seed, puis verifier que les roles necessaires aux dix comptes DEMO
sont presents. Une absence de role fait echouer le seed plutot que de modifier
un referentiel partage.

    AULIA_APP_MODE=demo
    AULIA_DEMO_SEED_CONFIRM=true
    AULIA_DEMO_PASSWORD=<mot-de-passe-demo>
    AULIA_DEMO_DATABASE_NAME=<nom-exact-base-demo>
    AULIA_DEMO_DATABASE_USER=<role-postgresql-demo>
    AULIA_DEMO_DATABASE_SENTINEL=<marqueur-de-base>
    AULIA_ENABLE_DIAGNOSTIC_AGENT=false
    AULIA_ENABLE_CONNECTED_CARE=false
    npm run prisma:migrate:deploy --workspace backend
    npm run db:seed:demo --workspace backend

Le seed est transactionnel et idempotent. Il cree une seule clinique DEMO,
dix comptes fictifs (Super Admin, Admin, Finance, Reception, Infirmier,
Medecin, Laboratoire, Radiologie, Pharmacie et Caisse), sept patients fictifs et les parcours Core
admission, constantes, consultation, laboratoire, ordonnance, pharmacie et
facturation. Il ne cree aucun compte DEV, ne modifie aucun role existant et
n'active que CORE.

## Publication web de demonstration

`aulia-care-demo.vercel.app` peut heberger le frontend statique, mais ne peut
pas heberger ce backend NestJS ni sa base PostgreSQL. Avant un deploiement
Vercel public, configurer dans le projet Vercel, sans les committer :

- `VITE_AULIA_PUBLIC_DEMO=true` ;
- `VITE_API_BASE_URL=https://<api-demo-dediee>` ;
- une API DEMO distincte, HTTPS, avec `CORS_ORIGIN` limite exactement a
  `https://aulia-care-demo.vercel.app` ;
- la base DEMO locale isolee, son role dedie et sa sentinelle, sans acces aux
  bases reelles.

Le build refuse volontairement le mode DEMO public sans URL API HTTPS. Ne pas
utiliser `care.aulia.cd` pour la demonstration publique : ce nom est reserve
a l'installation institutionnelle et doit pointer vers son propre proxy et son
propre certificat.

## Test PostgreSQL isole

test:demo-seed exige une base de test dediee, vide, avec son propre role et son
propre marqueur. Les variables sont AULIA_DEMO_TEST_DATABASE_URL,
AULIA_DEMO_TEST_DATABASE_NAME, AULIA_DEMO_TEST_DATABASE_USER,
AULIA_DEMO_TEST_DATABASE_SENTINEL et
AULIA_DEMO_TEST_CONFIRM=ISOLATED_POSTGRES_ONLY. Le marqueur est provisionne
separement par l'administrateur de l'instance de test : le test ne lance ni
ALTER DATABASE ni aucune commande de configuration PostgreSQL. Il verifie la
connexion reelle et l'absence de donnees metier avant sa premiere ecriture,
sinon il echoue sans modifier la base.
