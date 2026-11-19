# Corrections des consultations — 19 novembre 2026

Données synthétiques uniquement ; aucun dossier réel modifié. Les consultations déjà signées ou archivées ne sont pas réécrites.

## Corrigé

- Création et modification générique : statuts FINALIZED/CANCELLED refusés ; la signature passe uniquement par l’attestation médicale.
- Signature : toutes les demandes laboratoire et imagerie persistées sont relues sous verrou patient ; une liste navigateur vide ne masque plus un examen en attente.
- Laboratoire : chaque occurrence est contrôlée ; un ancien résultat ne valide pas une nouvelle demande identique. Les résultats saisis sur une ligne mettent aussi cette ligne à jour.
- Archivage médecin/administratif : écriture conditionnée par version et statut observés.
- Dossier signé ou archivé : nouveaux examens et ordonnances refusés ; remplacement financier existant d’ordonnance conservé avec motif.
- Sécurité médicamenteuse : allergies, ordonnances et interactions évaluées et écrites sous le même verrou patient.
- Spécialités : modèle du médecin, champs connus, options, schéma dentaire et valeurs numériques étiquetées validés côté serveur ; une évaluation spécialisée totalement vide n’est pas signée.
- Plainte reprise correctement ; un écran fermé ne remplace plus le brouillon par un état vide.
- Préremplissage vocal : aucun code R50.9 inventé.
- Consultation : plus de débordement mesuré à 1280×1800, 820×1180 et 424×793.

## Vérifié

- 199/199 tests serveur, 11/11 tests écrans, 15/15 parcours PostgreSQL/HTTP.
- Navigateur authentifié : neuf familles ouvertes, saisie spécialisée enregistrée et relue, neuf signatures relues, puis trois nouveaux actes refusés sans modifier le dossier signé.
- Consultation générale : plainte enregistrée, rechargée et réaffichée.
- Deux ordonnances simultanées incompatibles : une acceptée, une refusée.
- Contournement sans attestation et liste d’examens vide : tous deux refusés.

## Limites

Les règles cliniques obligatoires propres aux 154 spécialités restent à définir avec les soignants. Les avis spécialisés entre deux médecins, l’impression et les modes vocal/télésanté n’ont pas été testés. La validation clinique et l’installation sur site restent nécessaires.
