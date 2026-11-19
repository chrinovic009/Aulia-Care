# Résumé du workflow patient

Le statut `Patient.workflowStatus` est un résumé temporaire du workflow actif du pilote clinique, et non un historique exhaustif de tous les événements du patient.

En pratique, plusieurs événements peuvent coexister au même moment : rendez-vous à venir, demande de laboratoire, facture, consultation active, ancienne hospitalisation, prescription, etc. Le statut est donc un indicateur de direction de travail et non une représentation complète de l’épisode clinique.

Le modèle `Encounter` / `Episode` reste une évolution prévue, mais il n’est pas introduit dans ce correctif. À la place, le système protège les états prioritaires :

- `HOSPITALISE` ne peut pas être rétrogradé par des états régressifs tels que paiement, consultation ou accueil.
- `EN_CONSULTATION` ne peut pas être remplacé par une étape administrative ou de paiement régressive.
- `TERMINE` reste un point final d’un épisode, mais un nouveau parcours peut reprendre à partir d’un nouvel événement métier.
- Les transitions sont centralisées dans `PatientWorkflowService` pour éviter les écritures directes contradictoires.

Le service impose une priorité explicite des statuts critiques et refuse les régressions qui menaceraient la sécurité du parcours patient.

Cette séparation est volontaire :
- le workflow actif est synthétisé pour l’interface de pilotage clinique ;
- l’historique longitudinal du patient reste conservé dans les tables de consultation, prescription, laboratoire, imagerie, facturation et hospitalisation.

L’architecture cible est donc un résumé d’état court terme pour le pilotage, avec un futur `Encounter` dédié à la modélisation plus fine des épisodes de soins.
