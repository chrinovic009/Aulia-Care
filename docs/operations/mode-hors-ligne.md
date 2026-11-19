# Mode hors ligne — continuité des soins sans Internet

Aulia Care protège la continuité des soins à deux niveaux. Le premier est indispensable en établissement réel.

## 1. Serveur sur site (coupure Internet)

Le moyen fiable de rester opérationnel sans Internet est d'**héberger Aulia Care dans l'établissement**. Le serveur applicatif, PostgreSQL et le frontend tournent sur une machine du réseau local (LAN) avec `docker-compose.prod.yml`.

- Les postes et tablettes accèdent au serveur par le réseau local, par exemple `https://aulia.local`. Une coupure du lien Internet ne les touche pas.
- Seuls dépendent d'Internet : l'envoi des SMS et e-mails (l'outbox les garde et les renvoie au retour du lien), la téléconsultation et les mises à jour.
- Matériel minimum recommandé :
  - un serveur avec un onduleur d'au moins 30 minutes d'autonomie et un disque en RAID 1 ;
  - un commutateur et des points d'accès Wi-Fi sur onduleur.
- Sauvegardes : `pg_dump` chiffré chaque nuit sur un support externe, plus une copie hors site dès que le lien revient. Testez la restauration chaque mois.
- Le certificat TLS est émis par l'autorité interne (`ca/`). Il doit être installé sur chaque poste.

## 2. File d'attente sur l'appareil (coupure du réseau local ou Wi-Fi instable)

Si un appareil perd la connexion au serveur, par exemple une tablette en bout de couloir ou dans une ambulance, les **saisies critiques** restent possibles :

| Saisie | Où | Heure conservée |
|---|---|---|
| Signes vitaux | Infirmier › Patients assignés | `measuredAt`, l'heure de la mesure (refusée si plus de 72 h ou dans le futur) |
| Événements de soins des unités | Moteur de workflow (`occurredAt`) | heure de l'événement |

Fonctionnement :

1. La saisie part avec un en-tête `Idempotency-Key` unique.
2. En cas d'échec réseau, elle est gardée sur l'appareil. Le bandeau « Hors ligne » indique le nombre de saisies en attente.
3. L'envoi reprend automatiquement au retour du réseau, puis toutes les 30 secondes, dans l'ordre des saisies.
4. Le serveur n'applique **qu'une fois** chaque clé. Un renvoi, même répété, ne crée jamais de doublon : la table `IdempotencyRecord` garde le résultat pendant 7 jours et chaque personne ne voit que ses propres résultats. Réutiliser une clé pour une saisie différente est refusé (422).
5. Une saisie refusée par le serveur reste affichée « refusée — à vérifier », par exemple pour un patient transféré entre-temps ou un droit retiré. Elle n'est jamais supprimée sans action humaine.

Limites assumées :

- Les consultations, prescriptions, facturations et délivrances **ne sont pas** mises en file. Elles exigent des contrôles en temps réel : stock, tarifs, allergies et interactions, droits. Sans serveur joignable, elles se font sur papier puis sont saisies a posteriori.
- La file est propre à la personne connectée. Sur un poste partagé, la saisie d'un autre utilisateur n'est jamais renvoyée sous votre identité. Ne vous déconnectez pas avant l'envoi : le bandeau l'indique.
- Les données en attente sont stockées dans le navigateur de l'appareil. Les appareils doivent être verrouillés (code, session Aulia Care) et chiffrés.
- Une clé réservée par une requête interrompue au moment même du traitement reste « en cours » (409). Vérifiez dans le dossier avant de ressaisir.
