# Préparation des tarifs de vente pharmacie

Chaque établissement doit définir son propre tarif de vente en CDF pour chaque
médicament qu'il souhaite prescrire ou vendre. Le coût d'achat d'un lot est une
information de stock : il ne constitue jamais un prix patient et n'est pas
recopié automatiquement.

1. Connectez-vous comme `ADMIN` ou `PHARMACIST` de l'établissement.
2. Ouvrez **Pharmacie → Stock pharmacie → Tarif de vente établissement**.
3. Choisissez le médicament, saisissez un montant CDF strictement positif
   (deux décimales au maximum), puis enregistrez.
4. Vérifiez que le libellé passe de `tarif manquant` au montant enregistré.

Une ordonnance sans tarif de vente actif est refusée par le serveur avant toute
création de facture. Une modification ultérieure ne modifie jamais une ligne de
facture déjà créée : celle-ci conserve le montant, la devise et la quantité au
moment de la prescription.

Avant migration d'une installation existante, exportez la liste des médicaments
prescrits, faites valider les tarifs par l'établissement, puis configurez-les
explicitement. Les données historiques ne sont pas complétées à partir des
prix d'achat ou d'une approximation.
