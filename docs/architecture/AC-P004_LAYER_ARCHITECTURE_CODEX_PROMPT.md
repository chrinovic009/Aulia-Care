Tu travailles sur le dépôt Aulia Care, branche `feature/durcissement`.



OBJECTIF GÉNÉRAL



Refondre proprement la gestion des couches fonctionnelles d’Aulia Care afin de respecter définitivement l’architecture produit suivante :



1\. Aulia Care Core

2\. Aulia Care Connected Care

3\. Aulia Care Diagnostic Agent



L’ancien nom "Aulia Care AI" doit disparaître proprement du code, de la configuration, de l’interface, des tests et de la documentation pertinente afin d’éviter toute dette de nomenclature future.



Cette tâche est une refactorisation architecturale importante. Ne fais PAS de remplacement aveugle. Inspecte d’abord le dépôt, la base Prisma, les migrations existantes, les guards, les routes, les composants frontend, les tests et les variables d’environnement avant de modifier quoi que ce soit.



==================================================

1\. ARCHITECTURE PRODUIT À RESPECTER

==================================================



Les trois couches sont indépendantes et peuvent être activées séparément.



Les 7 combinaisons d’activation valides doivent être supportées :



1\. CORE

2\. CONNECTED

3\. DIAGNOSTIC

4\. CORE + CONNECTED

5\. CORE + DIAGNOSTIC

6\. CONNECTED + DIAGNOSTIC

7\. CORE + CONNECTED + DIAGNOSTIC



Aucune couche ne doit être implicitement ajoutée à une autre.



Par exemple :



\- DIAGNOSTIC seul doit être possible.

\- CONNECTED seul doit être possible.

\- CONNECTED + DIAGNOSTIC sans CORE doit être possible.

\- CORE ne doit jamais être injecté automatiquement.



Le système doit rester fail-closed :

si aucune configuration de couche valide n’existe pour une clinique, aucune couche fonctionnelle ne doit être considérée comme activée.



==================================================

2\. PROPRIÉTÉ FONCTIONNELLE DES COUCHES

==================================================



A. AULIA CARE CORE



Core possède toutes les fonctions hospitalières classiques qui doivent fonctionner sans Connected Care ni Diagnostic Agent.



Cela inclut notamment :



\- réception

\- gestion des patients

\- dossier patient

\- admissions

\- visites patient

\- rendez-vous classiques

\- consultations présentielles

\- hospitalisation

\- nursing / soins infirmiers

\- laboratoire classique

\- imagerie classique

\- pharmacie

\- chirurgie

\- bloc opératoire

\- facturation

\- paiements

\- caisse

\- finance

\- administration

\- services

\- départements

\- stocks

\- utilisateurs

\- rôles

\- audit

\- gestion hospitalière classique

\- portail patient classique



Le portail patient Core peut contenir notamment :



\- profil

\- dossier médical

\- prescriptions

\- traitements

\- résultats

\- historique

\- factures

\- paiements

\- hospitalisations

\- rendez-vous classiques

\- informations ordinaires liées à l’établissement



Core NE possède PAS :



\- téléconsultation

\- téléhealth

\- objets connectés

\- wearables

\- suivi quotidien connecté

\- monitoring distant

\- continuité établissement-domicile

\- fonctionnalités familiales de Connected Care

\- intelligence clinique ou agents diagnostiques



B. AULIA CARE CONNECTED CARE



Connected Care possède toutes les fonctionnalités de continuité des soins hors établissement.



Cela inclut notamment :



\- téléconsultation

\- telehealth

\- consultations à distance

\- wearables

\- montres connectées

\- dispositifs connectés

\- collecte distante de données

\- suivi quotidien connecté

\- daily check-in connecté

\- monitoring à distance

\- alertes liées au suivi connecté

\- continuité établissement-domicile

\- suivi patient à domicile

\- parent/enfant ou famille lorsque cette relation sert au suivi connecté

\- données provenant de dispositifs connectés



IMPORTANT :



Une fonctionnalité reste la propriété de Connected Care même si le Diagnostic Agent analyse ensuite ses données.



Exemple :



wearable = CONNECTED



Si CONNECTED + DIAGNOSTIC sont actifs :

\- Connected collecte et possède les données/fonctionnalités wearable.

\- Diagnostic peut analyser les données autorisées.

\- La propriété fonctionnelle ne devient jamais DIAGNOSTIC.



C. AULIA CARE DIAGNOSTIC AGENT



Diagnostic Agent possède toutes les fonctions d’intelligence.



Cela inclut notamment :



\- agents cliniques

\- intelligence clinique

\- analyse intelligente

\- assistance diagnostique

\- transcription intelligente

\- structuration intelligente d’une consultation

\- extraction structurée

\- détection de tendances

\- analyse longitudinale

\- raisonnement clinique assisté

\- suggestions destinées aux professionnels

\- analyse de résultats

\- corrélation intelligente de données

\- prédiction

\- détection intelligente de risques

\- suggestions d’examens

\- synthèses intelligentes

\- agents spécialisés

\- interprétation intelligente

\- moteur de raisonnement

\- provenance ou justification liée à une sortie intelligente

\- fonctionnalités futures d’intelligence clinique



Le Diagnostic Agent ne doit jamais être nécessaire au fonctionnement normal du Core.



==================================================

3\. RÈGLE FONDAMENTALE : VISIBILITÉ ≠ DISPONIBILITÉ

==================================================



Toutes les fonctionnalités Aulia Care pertinentes pour l’utilisateur peuvent rester visibles dans l’interface même lorsque leur couche propriétaire n’est pas activée.



NE PAS cacher systématiquement les fonctionnalités avec des conditions du type :



if (!layerEnabled) return null;



À la place :



\- la fonctionnalité reste visible si elle est pertinente pour le rôle et le contexte ;

\- elle apparaît verrouillée lorsque sa couche n’est pas active ;

\- un clic doit afficher un état/modal/panneau expliquant la couche requise.



Exemples :



Téléconsultation :

"Aulia Care Connected Care requis"



Analyse intelligente :

"Aulia Care Diagnostic Agent requis"



Wearables :

"Aulia Care Connected Care requis"



L’utilisateur ordinaire ou le patient ne peut PAS activer lui-même une couche.



==================================================

4\. BACKEND TOUJOURS AUTORITAIRE

==================================================



Même si le frontend montre une fonction verrouillée, le backend doit rester la source d’autorité.



Une requête directe vers une fonctionnalité d’une couche inactive doit être rejetée avec HTTP 403.



La sécurité ne doit jamais dépendre uniquement du frontend.



La vérification doit être faite serveur-side avec le contexte de clinique/tenant.



Conserver ou renforcer :



\- vérification de l’utilisateur

\- vérification de la clinique

\- vérification de la configuration des couches

\- fail-closed

\- isolation tenant



==================================================

5\. CORRIGER LA MAUVAISE CLASSIFICATION ACTUELLE

==================================================



Inspecte particulièrement :



backend/src/platform/layers/platform-layer-access.guard.ts



L’état actuel classe certaines fonctionnalités Connected Care comme AI.



Corriger notamment :



telehealth -> CONNECTED

teleconsultation -> CONNECTED

TELEHEALTH consultationMode -> CONNECTED

TELECONSULTATION consultationMode -> CONNECTED

daily-checkin connecté -> CONNECTED



Les fonctions d’intelligence restent DIAGNOSTIC.



À analyser soigneusement :



transcript

provenance



Règle :



\- transcription intelligente / structuration intelligente -> DIAGNOSTIC

\- provenance d’une sortie intelligente -> DIAGNOSTIC

\- provenance purement technique ou métier non intelligente -> déterminer selon sa vraie responsabilité



Ne classe pas une route sur la base de son nom uniquement.

Inspecte son comportement réel.



==================================================

6\. FAIRE DISPARAÎTRE "AULIA CARE AI"

==================================================



L’ancien nom du produit est :



Aulia Care AI



Le nouveau nom officiel est :



Aulia Care Diagnostic Agent



Le terme produit "Aulia Care AI" doit disparaître.



Faire un audit global du dépôt pour rechercher au minimum :



Aulia Care AI

AuliaLayer.AI

AULIA\_ENABLE\_CLINICAL\_AI

clinical-ai

ClinicalAI

clinicalAi

AI layer

AI module



Mais attention :



NE PAS remplacer aveuglément toutes les occurrences du terme générique "AI".



Des bibliothèques, concepts techniques ou textes génériques peuvent légitimement contenir "AI".



Ce qui doit disparaître, c’est l’ancienne IDENTITÉ PRODUIT.



==================================================

7\. ENUM PRISMA

==================================================



Inspecte l’enum Prisma `AuliaLayer`.



L’objectif cible est idéalement :



enum AuliaLayer {

&#x20; CORE

&#x20; CONNECTED

&#x20; DIAGNOSTIC

}



et non :



enum AuliaLayer {

&#x20; CORE

&#x20; CONNECTED

&#x20; AI

}



MAIS :



Avant de changer AI -> DIAGNOSTIC :



1\. inspecte les migrations existantes ;

2\. vérifie comment l’enum PostgreSQL est créé ;

3\. vérifie les données existantes ;

4\. crée une migration additive/sûre ;

5\. ne détruis aucune configuration de clinique ;

6\. ne recrée pas inutilement les tables ;

7\. ne supprime aucune donnée ;

8\. ne casse pas les environnements déjà migrés.



La migration doit préserver les configurations existantes contenant AI et les convertir proprement en DIAGNOSTIC.



Elle doit être compatible avec PostgreSQL.



Ne modifie PAS rétroactivement une migration déjà appliquée si une nouvelle migration est plus sûre.



==================================================

8\. VARIABLES D’ENVIRONNEMENT

==================================================



Remplacer proprement l’ancienne variable produit :



AULIA\_ENABLE\_CLINICAL\_AI



par :



AULIA\_ENABLE\_DIAGNOSTIC\_AGENT



Mettre à jour les fichiers concernés :



\- backend env examples

\- env production examples

\- Docker Compose

\- documentation de configuration

\- tests

\- services de couches



Ne jamais écrire ou modifier de vraies valeurs secrètes.



Ne touche pas aux secrets existants.



==================================================

9\. NOMMAGE INTERNE

==================================================



Inspecte les dossiers/modules nommés par exemple :



clinical-ai



Si ce module représente réellement le produit Diagnostic Agent, renomme-le proprement vers une terminologie cohérente, par exemple :



diagnostic-agent



et adapte :



\- imports

\- modules NestJS

\- controllers

\- services

\- tests

\- chemins

\- documentation



Mais ne fais ce renommage que si tu peux garantir qu’il reste maîtrisé et vérifiable.



Le nom public et architectural prioritaire est :



Aulia Care Diagnostic Agent



Évite de conserver deux terminologies concurrentes.



==================================================

10\. MÉTADONNÉES DE CAPABILITÉS FRONTEND

==================================================



Créer ou consolider un système centralisé de métadonnées des fonctionnalités.



Éviter des dizaines de conditions dispersées.



Exemple conceptuel :



type AuliaCapability = {

&#x20; id: string;

&#x20; requiredLayer: 'CORE' | 'CONNECTED' | 'DIAGNOSTIC';

&#x20; visibleTo?: Role\[];

};



Exemple :



{

&#x20; id: 'teleconsultation',

&#x20; requiredLayer: 'CONNECTED'

}



{

&#x20; id: 'diagnostic-assistant',

&#x20; requiredLayer: 'DIAGNOSTIC'

}



{

&#x20; id: 'patient-record',

&#x20; requiredLayer: 'CORE'

}



Le frontend doit pouvoir distinguer :



\- visible

\- enabled

\- locked

\- authorized



Une capacité peut être :



visible = true

enabled = false

locked = true



==================================================

11\. COMPOSANT DE VERROUILLAGE

==================================================



Créer ou consolider un composant réutilisable pour les fonctionnalités non activées.



Exemples de texte :



Pour CONNECTED :



"Aulia Care Connected Care n’est pas activé pour cet établissement."



Pour DIAGNOSTIC :



"Aulia Care Diagnostic Agent n’est pas activé pour cet établissement."



Pour CORE :



"Aulia Care Core n’est pas activé pour cet établissement."



Le composant ne doit PAS donner à un utilisateur ordinaire un bouton lui permettant d’activer lui-même la couche.



L’administration des couches reste réservée au mécanisme de provisioning/administration plateforme prévu.



==================================================

12\. MATRICE DES 7 ACTIVATIONS

==================================================



Ajouter des tests couvrant explicitement les sept combinaisons :



CORE

CONNECTED

DIAGNOSTIC

CORE + CONNECTED

CORE + DIAGNOSTIC

CONNECTED + DIAGNOSTIC

CORE + CONNECTED + DIAGNOSTIC



Pour chaque combinaison, vérifier au minimum :



\- accès Core

\- accès Connected

\- accès Diagnostic

\- 403 correct pour les couches absentes

\- aucune injection implicite de Core

\- aucune dépendance artificielle entre les couches



Exemple attendu :



CONNECTED seul :



Core route -> 403

Connected route -> autorisée

Diagnostic route -> 403



DIAGNOSTIC seul :



Core route -> 403

Connected route -> 403

Diagnostic route -> autorisée



CONNECTED + DIAGNOSTIC :



Core route -> 403

Connected route -> autorisée

Diagnostic route -> autorisée



Les tests doivent également vérifier que TELECONSULTATION requiert CONNECTED et non DIAGNOSTIC.



==================================================

13\. TESTS DE VISIBILITÉ FRONTEND

==================================================



Ajouter des tests représentatifs vérifiant :



CORE seul :

\- dossier patient disponible

\- téléconsultation visible mais verrouillée

\- wearables visibles mais verrouillés

\- Diagnostic Agent visible mais verrouillé



CONNECTED seul :

\- fonctions Connected disponibles

\- Core verrouillé lorsque pertinent

\- Diagnostic verrouillé



DIAGNOSTIC seul :

\- fonctions Diagnostic disponibles

\- Connected verrouillé

\- Core verrouillé



Toutes couches :

\- aucune fonctionnalité correspondant à une couche active ne doit apparaître verrouillée à cause du système de licence.



==================================================

14\. ISOLATION DES PANNES

==================================================



Respecter l’indépendance des produits :



\- Diagnostic indisponible -> Core continue

\- Diagnostic indisponible -> Connected continue

\- Connected indisponible -> Core continue

\- Connected indisponible -> Core + Diagnostic continuent

\- Core absent -> Connected et Diagnostic peuvent fonctionner selon leurs propres capacités



Ne crée aucune dépendance technique obligatoire contraire à cette règle.



==================================================

15\. NE PAS DÉPLACER LA PROPRIÉTÉ DES DONNÉES

==================================================



Lorsqu’une couche consomme les données d’une autre :



\- elle ne devient pas propriétaire de la fonctionnalité ;

\- l’accès doit dépendre des deux couches lorsque nécessaire.



Exemple :



Analyse diagnostique de données wearable :



CONNECTED nécessaire pour produire/posséder les données wearable.

DIAGNOSTIC nécessaire pour analyser intelligemment ces données.



Si Connected est actif mais Diagnostic non actif :

les données Connected restent utilisables normalement sans analyse intelligente.



Si Diagnostic est actif sans Connected :

Diagnostic ne doit pas inventer de données Connected inexistantes.



==================================================

16\. CONTRATS ENTRE COUCHES

==================================================



Lorsque deux couches communiquent, privilégier des contrats explicites.



Éviter les imports directs profonds et les dépendances circulaires.



Créer si nécessaire des interfaces/contracts clairement nommés.



Le but est que chaque couche puisse évoluer indépendamment.



==================================================

17\. COMPATIBILITÉ ET NON-RÉGRESSION

==================================================



Ne casse pas les fonctionnalités Core existantes.



Ne supprime pas de fonctionnalités métier existantes.



Ne change pas les comportements tenant-scoped déjà corrigés sans nécessité.



Ne touche pas aux corrections de sécurité existantes sauf si nécessaire pour la séparation des couches.



Ne supprime aucune migration existante.



Ne supprime aucune donnée.



Ne lance aucune commande destructive.



INTERDIT notamment :



docker compose down -v



Ne réécris pas l’historique Git.



Ne fais pas de force push.



Ne merge pas vers main.



==================================================

18\. AUDIT DES ROUTES

==================================================



Audite toutes les routes backend.



Pour chaque route fonctionnelle, détermine clairement sa couche propriétaire :



CORE

CONNECTED

DIAGNOSTIC

NONE / PLATFORM



Évite autant que possible une heuristique fragile uniquement basée sur le chemin.



Si l’architecture le permet proprement, introduis une déclaration explicite de propriété de couche sur les controllers/routes, par exemple avec un décorateur NestJS :



@RequireLayer(AuliaLayer.CONNECTED)



ou mécanisme équivalent.



Le guard global peut alors lire cette metadata.



Les routes de plateforme telles que :



/auth

/platform/layers

/platform/provisioning



ne doivent pas être artificiellement considérées comme Core.



Privilégie une architecture explicite plutôt qu’un énorme regex central impossible à maintenir.



==================================================

19\. NOM DU DÉCORATEUR / MÉCANISME

==================================================



Si tu introduis un décorateur de couche :



\- place-le dans l’infrastructure platform/layers

\- utilise Reflector NestJS

\- reste compatible avec APP\_GUARD

\- laisse une stratégie de fallback strictement contrôlée

\- ajoute des tests



Exemple conceptuel uniquement :



@RequireLayer(AuliaLayer.CONNECTED)



@Get(...)

...



Ne copie pas mécaniquement cet exemple si une structure meilleure existe déjà dans le dépôt.



==================================================

20\. PATIENT PORTAL

==================================================



Respecter strictement l’isolation patient existante.



Un patient ne doit accéder qu’à son propre portail/dossier autorisé.



La logique de couche ne doit jamais créer un fallback dangereux utilisant :



\- email

\- téléphone

\- nom

\- identité approximative



Conserver le lien explicite portalUserId -> Patient et le tenant clinicId.



==================================================

21\. MULTI-TENANT

==================================================



La configuration des couches reste par établissement/clinic.



Ne crée aucune configuration globale qui permettrait à une clinique d’hériter les couches d’une autre.



Le cache doit rester tenant-scoped.



Les tests doivent inclure au moins un scénario avec deux cliniques ayant des couches différentes.



Exemple :



Clinic A = CORE

Clinic B = CONNECTED + DIAGNOSTIC



Les droits de A ne doivent jamais contaminer B et inversement.



==================================================

22\. DOCUMENTATION

==================================================



Créer ou mettre à jour une documentation claire, idéalement un fichier comme :



docs/architecture/AULIA\_CARE\_LAYERS.md



Il doit expliquer :



\- les trois couches

\- leur responsabilité

\- les 7 configurations

\- la propriété fonctionnelle

\- visibilité vs disponibilité

\- règle 403 backend

\- relations entre Connected et Diagnostic

\- indépendance des couches

\- nomenclature officielle

\- principe de fail-closed



L’ancien nom "Aulia Care AI" ne doit pas être présenté comme le nom courant.



Il peut éventuellement être mentionné une seule fois dans une note de migration historique si cela est absolument nécessaire, du type :



"Ancienne nomenclature remplacée par Aulia Care Diagnostic Agent."



Mais évite cette mention si elle n’est pas utile.



==================================================

23\. AUDIT FINAL DU NOM

==================================================



À la fin, exécuter des recherches globales.



Exemples :



git grep -n -I "Aulia Care AI"

git grep -n -I "AuliaLayer.AI"

git grep -n -I "AULIA\_ENABLE\_CLINICAL\_AI"



Le résultat attendu est zéro occurrence active, sauf justification technique exceptionnelle explicitement documentée.



Vérifier aussi :



git grep -n -I "clinical-ai"

git grep -n -I "ClinicalAI"



Si certaines occurrences restent, explique précisément pourquoi.



==================================================

24\. VALIDATION OBLIGATOIRE

==================================================



Avant de considérer la tâche terminée, exécuter les validations disponibles dans le dépôt.



Au minimum selon les scripts existants :



\- Prisma validate

\- Prisma generate

\- migrations sur PostgreSQL de test isolé

\- lint

\- typecheck frontend

\- typecheck backend

\- unit tests

\- integration tests

\- E2E pertinentes

\- build frontend

\- build backend



Utilise les commandes réelles définies dans les package.json / workflow GitHub existants.



N’invente pas des commandes si le dépôt en possède déjà.



==================================================

25\. NE PAS COMMIT IMMÉDIATEMENT

==================================================



IMPORTANT :



Effectue les modifications et les validations, mais NE FAIS PAS encore de `git commit`.



À la fin, donne-moi d’abord :



1\. résumé architectural des changements

2\. liste exacte des fichiers modifiés

3\. migrations ajoutées

4\. résultat des tests

5\. résultat des builds

6\. résultat des recherches de l’ancien nom AI

7\. éventuelles occurrences résiduelles et justification

8\. `git status --short`

9\. `git diff --stat`

10\. risques ou éléments non terminés



Ensuite seulement j’autoriserai le commit.



==================================================

26\. CRITÈRES D’ACCEPTATION

==================================================



La tâche n’est terminée que si tous les critères suivants sont vrais :



\[ ] CORE, CONNECTED et DIAGNOSTIC sont trois couches indépendantes.



\[ ] Les 7 combinaisons sont supportées.



\[ ] Core n’est jamais injecté automatiquement.



\[ ] Telehealth appartient à CONNECTED.



\[ ] Teleconsultation appartient à CONNECTED.



\[ ] Wearables appartiennent à CONNECTED.



\[ ] Daily connected monitoring appartient à CONNECTED.



\[ ] Intelligence clinique appartient à DIAGNOSTIC.



\[ ] Transcription intelligente appartient à DIAGNOSTIC.



\[ ] Les fonctionnalités cross-layer restent visibles lorsque cela est pertinent.



\[ ] Une fonction inactive apparaît verrouillée au lieu d’être simplement supprimée de l’interface.



\[ ] L’API renvoie 403 pour une couche inactive.



\[ ] Le frontend ne constitue jamais la seule barrière de sécurité.



\[ ] Les utilisateurs ordinaires ne peuvent pas activer une couche.



\[ ] La configuration reste tenant-scoped.



\[ ] Deux cliniques avec des couches différentes restent strictement isolées.



\[ ] Aulia Care AI n’est plus le nom d’un produit dans le dépôt.



\[ ] AuliaLayer.AI est remplacé proprement par DIAGNOSTIC si techniquement réalisable sans corruption.



\[ ] La migration PostgreSQL conserve les configurations existantes.



\[ ] AULIA\_ENABLE\_CLINICAL\_AI est remplacé par une nomenclature Diagnostic Agent.



\[ ] Aucun secret n’est modifié ou exposé.



\[ ] Aucune donnée n’est supprimée.



\[ ] Aucun volume Docker n’est supprimé.



\[ ] Toutes les migrations passent.



\[ ] Prisma validate passe.



\[ ] Typecheck passe.



\[ ] Lint passe.



\[ ] Tests passent.



\[ ] Builds passent.



==================================================

27\. MÉTHODE DE TRAVAIL

==================================================



Travaille dans cet ordre :



PHASE A

Audit du dépôt sans modification.



PHASE B

Produis mentalement/techniquement une carte :

route/capability -> couche propriétaire.



PHASE C

Corrige la nomenclature Prisma et crée la migration sûre.



PHASE D

Corrige le backend et le système d’autorisation des couches.



PHASE E

Corrige la propriété Telehealth/Teleconsultation/Connected.



PHASE F

Met en place ou consolide les métadonnées frontend des capabilities.



PHASE G

Implémente le comportement visible mais verrouillé.



PHASE H

Renomme proprement l’ancien produit AI vers Diagnostic Agent.



PHASE I

Ajoute les tests des 7 configurations et multi-tenant.



PHASE J

Exécute toutes les validations.



PHASE K

Audit final des occurrences et rapport.



Ne passe pas sous silence les incohérences découvertes.

Si une ambiguïté architecturale existe, choisis la solution la plus cohérente avec les règles de ce prompt et explique-la dans le rapport final.



Ne crée pas de nouvelles fonctionnalités métier non demandées.



Ne transforme pas cette tâche en refonte générale de toute l’application.



Reste strictement centré sur :

\- séparation des couches,

\- ownership,

\- licensing,

\- visibilité verrouillée,

\- renommage Diagnostic Agent,

\- tests,

\- sécurité tenant.



==================================================

28\. RAPPEL DE LA DOCTRINE AULIA CARE

==================================================



Aulia Care est un produit composé de capacités pouvant appartenir à plusieurs couches commerciales et technologiques.



L’objectif n’est PAS d’avoir trois applications indépendantes visuellement.



L’utilisateur doit percevoir un seul environnement Aulia Care cohérent.



Toutes les fonctionnalités pertinentes peuvent donc être présentes dans l’expérience Aulia Care.



Ce qui varie est :



\- leur disponibilité,

\- leur activation,

\- leur ownership,

\- leur autorisation.



La couche ne doit jamais être confondue avec :



\- le rôle utilisateur,

\- le tenant,

\- le menu,

\- la page,

\- l’établissement.



Formule à conserver :



ROLE != LAYER != TENANT



et :



VISIBILITY != AVAILABILITY != AUTHORIZATION



Commence maintenant par auditer le dépôt actuel, puis effectue la tâche complète selon ces règles.

