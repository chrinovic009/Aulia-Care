# Déploiement des couches Aulia Care

## 1. Aulia Care Core seul

Le Core assure admissions, consultation manuelle, laboratoire, imagerie,
pharmacie, hospitalisation, facturation et dossier patient sans dépendre d’une
montre ou d’une IA.

Pour démarrer le Core sans les couches optionnelles, définissez avant le
démarrage du processus :

```text
AULIA_ENABLE_CLINICAL_AI=false
AULIA_ENABLE_CONNECTED_CARE=false
```

Il ne doit pas y avoir de tentative de secours vers l’IA dans un parcours de
soin : l’absence du module ne bloque donc pas une admission ou une consultation.

## 2. Aulia Care IA seule

L’IA portable est démarrable avec `npm run dev:clinical-ai`. Elle ne charge ni
Prisma ni les modules Core et expose uniquement :

```text
POST /api/v1/clinical-ai/execute
x-aulia-ai-key: <CLINICAL_AI_SERVICE_SECRET>
```

Elle accepte uniquement `ClinicalAIRequest` version `1.0`, retourne une réponse
versionnée et n’écrit aucun dossier patient. Le Core peut aujourd’hui utiliser
le moteur local ; le remplacement par un client HTTP vers ce service ne change
pas le contrat.

## 3. Aulia Connected Care seule ou intégrée

`ConnectedCareRuntime` est une classe portable qui dépend de trois ports :
annuaire patient, consentement et passerelle d’ingestion. Un déploiement
autonome peut brancher FHIR/REST à ces ports ; le déploiement intégré utilise
`CoreConnectedCareService`. La passerelle autonome démarrable avec
`npm run dev:connected-care` ne contient ni Prisma ni module Core : elle relaie
le contrat vers Core en HTTPS, lequel refait systématiquement les contrôles.

L’entrée Core intégrée est `POST /connected-care/v1/observations`. Elle impose
une clé de service, le tenant, une montre Aulia attribuée, un consentement actif
et une clé d’idempotence. Les données sont refusées par défaut si l’un de ces
contrôles manque.

La passerelle autonome exige également sa propre clé
`CONNECTED_CARE_GATEWAY_SECRET`. Ces secrets restent strictement
serveur-à-serveur et doivent être rotatés dans un coffre à secrets.

## Variables de déploiement à fournir hors dépôt

| Processus | Variables requises |
| --- | --- |
| Core avec IA locale | `JWT_SECRET`, `DATABASE_URL` |
| Core avec IA séparée | ci-dessus + `AULIA_CLINICAL_AI_URL`, `CLINICAL_AI_SERVICE_SECRET` |
| IA séparée | `CLINICAL_AI_SERVICE_SECRET`, optionnellement `CLINICAL_AI_PORT` |
| Core avec Connected Care | `CONNECTED_CARE_INGESTION_SECRET` |
| Passerelle Connected Care | `CONNECTED_CARE_GATEWAY_SECRET`, `AULIA_CORE_CONNECTED_CARE_URL`, `CONNECTED_CARE_INGESTION_SECRET`, optionnellement `CONNECTED_CARE_PORT` |

Ne placez jamais ces secrets dans le frontend, un QR code, le dépôt Git ou la
configuration d’une montre. Utilisez HTTPS interne avec certificat valide et,
à terme, mTLS/OAuth2 client credentials plutôt qu’une clé partagée.

## Migration obligatoire avant l’activation Connected Care

La migration `20260824133000_connected_care_contract` ajoute les consentements
révocables. Elle doit être appliquée dans chaque environnement avant toute
ingestion de montre. Sans cette migration, activez
`AULIA_ENABLE_CONNECTED_CARE=false` : le Core reste volontairement disponible,
mais la passerelle Connected Care ne doit pas être exposée.

## Limites à ne pas présenter comme achevées

- Une clé secrète partagée est une étape de transition : la production doit
  évoluer vers mTLS ou OAuth2 client credentials, rotation et coffre à secrets.
- Les adaptateurs FHIR, DICOM, Apple HealthKit, Samsung Health et APNs/FCM ne
  sont pas encore des connecteurs officiels de production.
- Une certification exige gouvernance clinique, analyse de risques, tests de
  charge, audit indépendant, sauvegardes restaurées et conformité locale ; elle
  ne peut pas être déclarée par le code seul.
