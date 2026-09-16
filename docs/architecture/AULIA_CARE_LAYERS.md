# Couches Aulia Care

## Produits indépendants

| Couche | Propriétaire fonctionnel | Exemples |
| --- | --- | --- |
| Aulia Care Core | Système hospitalier présentiel | admissions, dossier, consultations présentielles, laboratoire, imagerie, pharmacie, facturation et portail patient classique |
| Aulia Care Connected Care | Continuité établissement-domicile | téléconsultation, téléhealth, montres et dispositifs, suivi quotidien connecté, monitoring distant et relations famille liées au suivi |
| Aulia Care Diagnostic Agent | Intelligence clinique assistée | analyse intelligente, suggestions cliniques, structuration et transcription intelligentes, analyse de tendances et provenance d’une sortie intelligente |

Les trois licences sont indépendantes. Les sept choix valides sont : Core, Connected Care, Diagnostic Agent, Core + Connected Care, Core + Diagnostic Agent, Connected Care + Diagnostic Agent, ou les trois. Aucune licence n’ajoute Core implicitement.

`ROLE != LAYER != TENANT` et `VISIBILITY != AVAILABILITY != AUTHORIZATION`.

## Propriété des données et des fonctions

Une montre, une téléconsultation et un suivi quotidien restent des capacités Connected Care lorsque le Diagnostic Agent les analyse. Connected Care est nécessaire pour produire et exploiter ces données ; Diagnostic Agent est nécessaire pour produire une analyse intelligente. Le Diagnostic Agent seul ne crée jamais de données Connected Care.

## Sécurité et accès

Chaque contrôleur optionnel déclare sa couche via `@RequireLayer`. Le `PlatformLayerAccessGuard` lit cette métadonnée, récupère la configuration de la clinique authentifiée et refuse avec HTTP 403 une couche inactive. Les routes Core historiques utilisent uniquement un fallback Core contrôlé. Les routes `/auth`, `/platform/layers` et `/platform/provisioning` ne sont pas assimilées à Core.

Le frontend affiche les capacités pertinentes même hors licence. Elles sont alors verrouillées, indiquent le produit requis et ne donnent aucun moyen à un utilisateur ordinaire d’activer la licence. Le backend reste toujours l’autorité.

## Déploiement indépendant

Le Diagnostic Agent est un processus séparé (`npm run dev:diagnostic-agent` ou `npm run start:diagnostic-agent`). Il communique à travers le contrat `DiagnosticAgentRequest` / `DiagnosticAgentResponse` et l’endpoint interne `/api/v1/diagnostic-agent/execute`.

Les variables de configuration sont :

```text
AULIA_ENABLE_DIAGNOSTIC_AGENT=true|false
AULIA_DIAGNOSTIC_AGENT_URL=http://diagnostic-agent:3100
DIAGNOSTIC_AGENT_SERVICE_SECRET=<secret inter-service>
DIAGNOSTIC_AGENT_PORT=3100
AULIA_ENABLE_CONNECTED_CARE=true|false
```

Les services Docker n’ont pas de dépendance de démarrage entre Core, Connected Care et Diagnostic Agent. Une indisponibilité de Diagnostic Agent ne bloque donc pas Core ou Connected Care ; une indisponibilité de Connected Care ne bloque pas Core ou Diagnostic Agent. Une action qui nécessite un service indisponible échoue explicitement, sans dégrader ou élargir une autre couche.

## Migration de licences

La migration `20260910110000_diagnostic_agent_layers` renomme la valeur PostgreSQL `AI` en `DIAGNOSTIC`. PostgreSQL préserve l’identité interne de la valeur d’enum, donc les configurations de licence déjà stockées sont conservées, sans reconstruction de table ni perte de données.
