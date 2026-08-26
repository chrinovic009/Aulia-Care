# Parcours Core du patient

Le parcours opérationnel est : admission, visite, paiement/autorisation,
triage, consultation, prescription/demande d’examen, exécution, résultat,
délivrance éventuelle, hospitalisation, facturation et dossier longitudinal.

Les transitions sensibles doivent être faites dans une transaction : paiement
et facture, admission et visite, hospitalisation et lit, affectation
infirmière et capacité, dispensation et stock. Une interface ne doit jamais
déduire une transition clinique à partir d’un simple texte ou d’un état local.
