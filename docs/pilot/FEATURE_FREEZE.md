
# AULIA CARE — FEATURE FREEZE PILOT-1

## 1. Statut

À compter de la validation de ce document, Aulia Care entre officiellement en phase :

**FEATURE FREEZE — PILOT-1**

L’objectif de cette phase est de stabiliser, sécuriser, tester et préparer le produit pour son premier déploiement pilote réel.

Aucune extension fonctionnelle majeure ne doit être entreprise tant que les critères de sortie du Feature Freeze ne sont pas atteints.

---

## 2. Objectif

Le Feature Freeze vise à empêcher l’élargissement continu du produit avant que son périmètre actuel n’ait été démontré comme :

- fonctionnel ;
- sécurisé ;
- stable ;
- performant ;
- observable ;
- reproductible au déploiement ;
- sauvegardable et restaurable ;
- utilisable par de vrais professionnels ;
- exploitable dans un établissement pilote.

---

## 3. Modifications autorisées pendant le Feature Freeze

Les modifications suivantes restent autorisées :

### 3.1 Corrections fonctionnelles

- bugs bloquants ;
- bugs affectant les workflows du pilote ;
- incohérences métier ;
- erreurs de données ;
- défauts empêchant un utilisateur d’accomplir une tâche prévue dans le périmètre PILOT-1.

### 3.2 Sécurité

Sont autorisées toutes les corrections concernant notamment :

- authentification ;
- autorisation ;
- RBAC ;
- isolation multi-tenant ;
- secrets ;
- sessions ;
- JWT ;
- validation des entrées ;
- accès aux données ;
- uploads ;
- logs sensibles ;
- vulnérabilités des dépendances ;
- sécurité réseau ;
- sécurité Docker.

### 3.3 UX critique

Peuvent être corrigés :

- blocages utilisateurs ;
- parcours incompréhensibles ;
- erreurs de navigation ;
- interactions provoquant des erreurs métier ;
- éléments empêchant l’accomplissement correct d’un workflow du pilote.

Les modifications purement esthétiques ne sont pas prioritaires.

### 3.4 Performance et stabilité

Sont autorisées les modifications nécessaires pour :

- réduire les temps de réponse ;
- supprimer les memory leaks ;
- améliorer les accès PostgreSQL ;
- améliorer Redis ;
- corriger les timeouts ;
- améliorer les performances frontend ;
- stabiliser les services Docker.

### 3.5 Infrastructure et déploiement

Sont autorisés :

- Docker ;
- reverse proxy ;
- HTTPS ;
- migrations ;
- sauvegarde ;
- restauration ;
- chiffrement ;
- monitoring ;
- logs ;
- métriques ;
- alertes ;
- automatisation du déploiement ;
- automatisation des mises à jour ;
- rollback.

### 3.6 Exigences issues du terrain

Une nouvelle exigence fonctionnelle peut exceptionnellement être intégrée si elle est démontrée comme indispensable au fonctionnement réel du pilote.

Elle doit être documentée avant implémentation.

---

## 4. Modifications interdites

Pendant le Feature Freeze, les éléments suivants sont interdits sauf décision explicitement documentée :

- nouveau grand module ;
- nouvelle couche métier non indispensable au pilote ;
- fonctionnalité expérimentale ;
- refonte esthétique globale ;
- animation ou design non essentiel ;
- intégration externe non nécessaire au PILOT-1 ;
- ajout d’une fonctionnalité uniquement parce qu’elle semble intéressante ;
- modification importante sans critère de validation mesurable.

---

## 5. Backlog POST-PILOT

Toute idée utile mais non nécessaire au PILOT-1 doit être placée dans :

`docs/pilot/POST_PILOT_BACKLOG.md`

Chaque entrée doit contenir :

- ID ;
- titre ;
- description ;
- justification ;
- impact attendu ;
- origine de la demande ;
- priorité estimée ;
- statut.

Aucune entrée POST-PILOT ne doit être développée pendant le Feature Freeze sans reclassification formelle.

---

## 6. Classification des changements

Chaque changement proposé pendant cette phase doit être classé dans une des catégories suivantes :

- `P0 — Critical`
- `P1 — High`
- `P2 — Medium`
- `P3 — Low`
- `POST-PILOT`

### P0 — Critical

Problème empêchant le fonctionnement du pilote ou présentant un risque grave de sécurité, de perte de données ou d’intégrité.

### P1 — High

Problème important affectant directement un workflow essentiel du pilote.

### P2 — Medium

Problème réel mais non bloquant.

### P3 — Low

Amélioration mineure.

### POST-PILOT

Fonctionnalité ou amélioration non nécessaire à la validation du PILOT-1.

---

## 7. Critères de sortie du Feature Freeze

Le Feature Freeze pourra être levé uniquement lorsque les preuves suivantes auront été obtenues :

- AC-P001 — Build reproductible ;
- AC-P002 — Tenant isolation ;
- audit sécurité pré-pilote terminé ;
- rotation des secrets de production terminée ;
- AC-P003 — Disaster Recovery ;
- AC-P004 — Performance baseline ;
- AC-P005 — Stability baseline ;
- AC-P006 — Observability ;
- AC-P007 — Reproducible deployment ;
- AC-P008 — Usability baseline ;
- AC-P009 — Pilot agreement ;
- AC-P010 — Training reproducibility ;
- AC-P011 — Operational reliability ;
- AC-P012 — 30-day field evidence ;
- AC-P013 — Unit economics ;
- AC-P014 — First paying customer ;
- AC-P015 — Deployment reproducibility.

---

## 8. Règle de décision

Pour chaque nouvelle demande, la question suivante doit être posée :

> Cette modification est-elle nécessaire pour rendre le PILOT-1 plus fiable, plus sûr, plus stable, plus exploitable ou réellement utilisable sur le terrain ?

Si la réponse est non, la modification doit être déplacée vers le backlog POST-PILOT.

---

## 9. État

**Feature Freeze : ACTIF**

**Phase : AULIA CARE PILOT-1**

**Objectif : préparation et validation du premier établissement pilote.**
