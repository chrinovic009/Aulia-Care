# Isolation tenant

Les contrôles tenant sont fail-closed : tout acteur clinique sans établissement
est refusé par la stratégie JWT et par les services tenant-scoped. Les comptes
historiques ne sont jamais rattachés au premier établissement trouvé.

Les accès inter-établissement renvoient `403` ou `404` selon qu’une ressource
doit rester non découvrable. Une erreur `403` pour un compte opérationnel doit
être examinée par `npm run audit:tenant-integrity`, puis corrigée par le
workflow explicite approprié.

Les couches optionnelles sont des licences par établissement. Une route AI ou
Connected n’est accordée que lorsque la configuration du `clinicId` de l’acteur
contient explicitement la couche demandée.
