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
# Isolation multi-établissement — invariants actuels

Par défaut, un utilisateur doit être rattaché à un établissement pour accéder aux données cliniques. Les consultations ouvertes, lues ou modifiées sont filtrées par `clinicId`; le patient, le rendez-vous et l’hospitalisation liée sont vérifiés dans le même établissement.

Les hospitalisations vérifient également le patient, la consultation source, l’unité de soins, le lit et les infirmiers avant toute mutation. Aucun `clinicId`, `providerId`, `physicianId` ou `assignedById` fourni par le navigateur ne devient une source d’autorité.

L’isolation n’est pas encore centralisée dans une surcouche Prisma : chaque domaine Core doit donc continuer à appliquer l’invariant explicitement. Les tests E2E Clinic A / Clinic B restent une condition avant une déclaration de conformité de production.
