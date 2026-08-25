# Architecture trois couches d’Aulia Care

## Décision

Aulia Care reste un monolithe modulaire NestJS + Prisma. Les trois produits sont séparés par des contrats métier et d’API afin de pouvoir être activés, déployés ou extraits progressivement sans réécrire le Core.

```text
                         PLATFORM (partagée)
      IAM · tenant/clinique · audit · sécurité · notifications · observabilité
                                      │
       ┌──────────────────────────────┼──────────────────────────────┐
       ▼                              ▼                              ▼
 AULIA CARE CORE                AULIA CARE IA              AULIA CONNECTED CARE
 SIH transactionnel             API de décision            Patient hors établissement
 et dossier clinique            assistée, non clinique      et dispositifs
```

L’indépendance ne signifie pas qu’un produit médical fonctionne sans identité, sécurité, tenant ou audit. Ces éléments constituent la plateforme commune. Elle signifie qu’aucune couche ne dépend directement des tables, de l’UI ou des règles internes d’une autre couche.

## État observé dans le dépôt

| Couche | Modules actuels | Dépendance actuelle | État |
|---|---|---|---|
| Core | patients, appointments, consultations, hospitalizations, laboratory, imaging, pharmacy, surgery, billing, administration | Prisma, IAM, notifications | Fonctionnel, mais tenantisation encore incomplète. |
| IA | `clinical-intelligence`, `intelligence` | Lit directement `Consultation`, `Patient`, `MedicalHistory` par Prisma | Non utilisable par un SIH tiers sans le Core. Les regex restent un fallback. |
| Connected | patient, téléconsultation, `wearables`, messages | Lié directement à `Patient`, `WearableDevice` et notifications Core | Utile intégré, non autonome à ce stade. |

## État après le premier découplage exécutable

- **Core seul** : `AULIA_ENABLE_CLINICAL_AI=false` et
  `AULIA_ENABLE_CONNECTED_CARE=false` empêchent Nest de charger les modules
  optionnels. Les parcours manuels Core restent disponibles.
- **IA** : le moteur `ClinicalAIEngineService` est portable, sans Prisma ni
  import Core. Core ne lui transmet qu’un `ClinicalAIRequest` minimisé via
  `ClinicalAIClient`; il peut choisir un moteur local ou un service HTTP
  indépendant (`main-clinical-ai.ts`).
- **Connected Care** : la passerelle portable n’importe ni Core ni Prisma et
  relaie le contrat vers une API Core versionnée. Core contrôle ensuite tenant,
  consentement, attribution de la montre et idempotence.

Ce découplage est opérationnel, mais il n’équivaut pas encore à une certification
médicale ou à une interopérabilité FHIR/DICOM complète.

## Contrats cibles

### Aulia Care Core

Le Core doit fonctionner sans IA ni Connected Care : admission, triage, consultation manuelle, examens, laboratoire, imagerie, prescription, pharmacie, hospitalisation, facturation et dossier patient restent disponibles.

Il publie seulement des événements minimisés :

```text
core.encounter.created
core.encounter.finalized
core.observation.recorded
core.result.available
core.patient.consent.changed
```

### Aulia Care IA

L’IA reçoit une entrée clinique normalisée, pas un `consultationId` Core. Elle peut ainsi servir le Core ou un SIH tiers.

```ts
type ClinicalAIRequest = {
  tenantId: string;
  subject: { externalPatientId?: string; ageYears?: number; sex?: string };
  encounter: { externalEncounterId?: string; language: string; transcript?: string; clinicalText?: string };
  observations?: Array<{ code?: string; label: string; value: string | number; unit?: string; observedAt?: string }>;
  allergies?: Array<{ code?: string; label: string }>;
  idempotencyKey: string;
};
```

Les réponses sont versionnées, explicables et toujours marquées « À vérifier ». L’IA ne prescrit pas, ne finalise pas une consultation et n’écrit pas directement dans une table clinique Core.

### Aulia Connected Care

Connected Care utilise un identifiant patient externe et un consentement, pas un accès SQL au Core.

```ts
type ConnectedSubject = { tenantId: string; externalPatientId: string; consentId: string };
```

| Mode | Source clinique | Fonctionnement |
|---|---|---|
| Intégré | API Core | Portail, téléconsultation et montre liés au dossier Aulia. |
| SIH tiers | FHIR/REST | Dossier, rendez-vous et observations par connecteur. |
| Autonome limité | Connected Care | Téléconsultation, consentements, messagerie et mesures, sans prétendre remplacer le dossier hospitalier. |

Une panne IA, montre, portail ou télésanté ne doit jamais bloquer une admission ou une consultation manuelle du Core.

## Règles de dépendance

```text
Core       ──X──> IA / Connected Care (dépendance obligatoire interdite)
IA         ──X──> Prisma Core / UI Core (interdite)
Connected  ──X──> Prisma Core / UI Core (interdite)
Toutes les couches ────> Platform (IAM, tenant, audit, observabilité)
Intégration entre couches = API versionnée, événement ou adaptateur
```

Les dépendances directes actuelles de `ClinicalIntelligenceService` vers Prisma et de `WearablesService` vers les modèles patient sont des points de transition, pas le modèle final.

## Transition non destructive

1. Stabiliser le Core : isolation tenant, parcours E2E, audit et aucune dépendance obligatoire à l’IA ou Connected.
2. Créer les contrats : `ClinicalAIRequest`, `ClinicalAIResponse`, `ConnectedSubject`, `DeviceObservation` et événements versionnés.
3. Créer des ports : `ClinicalAIClient`, `ClinicalAIProvider`, `PatientDirectoryPort`, `ConsentPort`, `DeviceGatewayPort`.
4. Ajouter des adaptateurs Aulia internes qui passent par API/service contractuel, pas par lecture Prisma inter-domaine.
5. Exposer IA v1 : clé de service, scopes, tenant, idempotence, quota, audit et fournisseur IA côté serveur seulement.
6. Exposer Connected v1 : connecteur patient/FHIR, consentements, webhook d’observations et TURN hospitalier.
7. Extraire seulement quand charge ou sécurité le justifient : IA puis Device Gateway peuvent devenir des services séparés sans changer le contrat.

## Critère d’achèvement

Une couche est indépendante seulement si elle a un contrat versionné, une authentification de service, une isolation tenant, des tests de contrat, une stratégie de stockage/documentation de déploiement et aucun import direct de table, DTO ou composant UI d’une autre couche.
