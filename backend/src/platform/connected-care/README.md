# Aulia Connected Care — frontière exécutable

`ConnectedCareRuntime` fonctionne sans Prisma, Nest ou module Core. Son hôte
fournit trois ports : annuaire patient, contrôle de consentement et passerelle
d’ingestion. Un déploiement autonome peut donc utiliser un annuaire FHIR et un
service de consentement distincts.

Le Core Aulia fournit temporairement ces ports dans
`CoreConnectedCareService`. La seule entrée serveur-à-serveur est :

`POST /connected-care/v1/observations`

Elle exige :

- `x-aulia-integration-key` égal à `CONNECTED_CARE_INGESTION_SECRET` ;
- le contrat `CONNECTED_CARE_CONTRACT_VERSION` ;
- un tenant correspondant à la clinique du patient ;
- une montre Aulia active attribuée au patient ;
- un consentement `WEARABLES` actif et révocable ;
- une clé d’idempotence par mesure.

La clé est exclusivement serveur-à-serveur : jamais dans une application web,
une montre ou un code QR. En production, stockez-la dans un gestionnaire de
secrets et remplacez-la périodiquement.
