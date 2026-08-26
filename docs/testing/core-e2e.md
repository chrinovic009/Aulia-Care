# Tests du Core

Les scripts disponibles sont :

- `npm run test:unit` : politiques déterministes et comportement UI isolé ;
- `npm run typecheck` : TypeScript frontend et backend ;
- `npm run build` : build de production.

Une suite E2E avec PostgreSQL jetable reste à mettre en place. Elle devra appliquer les migrations dans une base locale/CI dédiée, jamais dans une base clinique, et vérifier au minimum l’isolation Clinic A / Clinic B et le parcours admission → paiement → consultation → lit → sortie.
