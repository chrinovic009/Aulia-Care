# Invariants Aulia Care Core

1. Une consultation, une facture, un paiement et une hospitalisation sont lisibles seulement dans l’établissement autorisé.
2. Une consultation est liée à un patient, un rendez-vous et un médecin vérifiés côté serveur.
3. Un lit `FREE` ne peut être affecté qu’une fois : la revendication utilise une mise à jour atomique.
4. Une hospitalisation annulée conserve son dossier ; seules ses ressources opérationnelles sont libérées.
5. Une infirmière ne peut écrire que pendant une couverture autorisée ; l’absence d’affectation ne vaut jamais permission implicite.
6. Les timestamps sont en UTC. Les règles de jour, nuit et repos utilisent la timezone IANA de la clinique.
7. Un refresh token consommé qui réapparaît révoque la session concernée.
8. Les mots de passe, PIN et tokens bruts ne sont jamais écrits dans les journaux d’audit.
