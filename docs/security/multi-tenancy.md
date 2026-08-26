# Isolation des établissements

Le principe cible est le refus par défaut de tout accès inter-clinique.
Chaque service Core doit résoudre l’acteur authentifié, utiliser son
`clinicId`, puis inclure ce périmètre dans chaque lecture ou mutation de donnée
clinique, financière ou opérationnelle.

Les données historiques avec `clinicId = NULL` ne peuvent être visibles que
dans une installation explicitement mono-clinique. Cette compatibilité est
transitoire : les données doivent être rattachées par une opération de reprise
auditée avant l’activation d’une seconde clinique.

Les contrôles de rôle ne remplacent pas ce périmètre : être `PHYSICIAN`,
`FINANCE` ou `ADMIN` ne donne jamais accès à une autre clinique.
