# Remplacement d'une ordonnance déjà facturée

Une ordonnance facturée est immuable. Le remplacement est un nouveau document,
relié à l'original par `PrescriptionReplacement`, avec son motif clinique, le
médecin demandeur, le valideur Finance/Administration, les deux ordonnances et
les deux factures.

- facture impayée : après validation, l'ancienne facture est annulée et une
  nouvelle ordonnance/facture est créée ;
- paiement partiel ou intégral : l'ancienne facture est préservée, une demande
  de remboursement motivée est créée et reste soumise au second contrôle
  Finance ;
- prise en charge entreprise non consolidée : la charge en attente est annulée,
  puis la nouvelle ordonnance suit le circuit de couverture normal ;
- période entreprise consolidée : la période fermée n'est jamais modifiée. La
  demande conserve la filiation afin que Finance réalise une régularisation de
  période suivante ;
- médicament déjà délivré : le remplacement est refusé tant qu'une restitution
  physique, validée séparément par la pharmacie, n'a pas eu lieu.

Le parcours ne remet jamais de stock automatiquement et n'annule jamais une
administration infirmière.
