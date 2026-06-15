# 📊 Système de Gestion Caissier - D7 Clinic

## Vue d'ensemble

Un système complet de gestion pour le caissier avec récupération des données en temps réel depuis PostgreSQL, permettant le suivi des patients en attente de paiement et la génération de factures professionnelles.

---

## 🔄 Workflow des patients

```
RECEPTION (Admission créée)
    ↓
EN_ATTENTE_DE_PAIEMENT (Frais d'admission non payés)
    ↓ [Caissier reçoit le patient, traite le paiement]
EN_ATTENTE_VALIDATION_CAISSE (Paiement reçu, en attente de validation)
    ↓ [Caissier valide et transfère]
EN_ATTENTE_INFIRMERIE (ou autre service selon orientation)
```

---

## 📄 Pages implémentées

### 1. **DashboardCaissier.tsx** - Tableau de bord

#### Fonctionnalités :
- **Affichage en temps réel** des patients en attente de paiement ou en attente de validation caisse
- **Filtres par statut** : Tous / En attente paiement / En attente validation
- **Tri chronologique** : Les dossiers les plus récents en premier
- **Actions rapides** :
  - `Traiter le paiement` : Enregistre le paiement et change le statut en EN_ATTENTE_VALIDATION_CAISSE
  - `Valider et continuer` : Finalise et transfère le patient à l'étape suivante
  - `Reporter` : Marque le dossier comme reporté pour plus tard

#### Données affichées :
- Totals d'aujourd'hui (montant encaissé, nombre de paiements)
- Nombre de dossiers en attente de paiement et de validation
- Liste détaillée avec :
  - Nom, service, téléphone du patient
  - Montant des frais d'admission
  - Solde dû
  - Heure d'arrivée
  - Statut actuel

#### Rafraîchissement automatique
- Les données se rafraîchissent automatiquement toutes les 30 secondes
- Les erreurs de connexion sont affichées

---

### 2. **FacturationCaissier.tsx** - Gestion des factures

#### Fonctionnalités :
- **Liste de toutes les factures** de frais d'admission
- **Filtres avancés** :
  - Par statut : Toutes / En attente / Payées / Partiellement payées
  - Recherche par : Patient, téléphone, numéro de facture
- **Statistiques** :
  - Montant total à recouvrer
  - Nombre de factures par statut
  - Soldes dus

#### Impression professionnelle
- Bouton `Imprimer` pour chaque facture
- Template format A5 (5.8" x 8.3") adapté à une imprimante de factures
- Contient :
  - **En-tête** : Nom et coordonnées de la clinique
  - **Détails** : N° de facture, dates d'émission et d'échéance
  - **Infos patient** : Nom, téléphone, email
  - **Tableau détaillé** : Type de service, montant, statut
  - **Totals** : Montant total et solde dû
  - **Pied de page** : Mentions légales

---

### 3. **HistoriqueCaissier.tsx** - Historique financier

#### Fonctionnalités :
- **Vue combinée** des paiements ET factures triés chronologiquement
- **Filtres multiples** :
  - Par type : Tous / Paiements / Factures
  - Par période : Aujourd'hui / Cette semaine / Ce mois / Tous les temps
  - Recherche : Patient, téléphone, référence
- **Statistiques détaillées** :
  - Total paiements reçus
  - Total factures émises
  - Solde net (paiements - factures)

#### Impression complète
- Bouton `📄 Imprimer l'historique`
- Template format A4 (21 x 29.7 cm)
- Contient :
  - **En-tête** : Info clinique + date d'impression
  - **Résumé** : Totals paiements et factures
  - **Tableau détaillé** : Liste de tous les enregistrements avec :
    - Date et heure précise
    - Type (PAIEMENT ou FACTURE)
    - Patient et téléphone
    - Méthode/Type de service
    - Référence
    - Montant
  - **Pied de page** : Mention légale et heure d'impression

---

## 🔌 Architecture API

### Endpoints Backend créés/modifiés

#### Patients
- `GET /patients/cashier/awaiting-payment` - Récupère les patients en attente
  - Filtre : `workflowStatus` IN [EN_ATTENTE_DE_PAIEMENT, EN_ATTENTE_VALIDATION_CAISSE]
  - Inclut les factures d'admission non payées
  - Retourne : Patient + Invoice détails

#### Billing
- `GET /billing/invoices` - Récupère toutes les factures avec patient + paiements
- `GET /billing/payments` - Récupère tous les paiements avec détails patient

#### Payments
- `GET /payments` - Récupère tous les paiements (alias de /billing/payments)
- `POST /payments` - Crée un paiement (existant)

### Fonctions API Frontend (cashier.ts)

```typescript
// Récupère patients en attente
fetchPatientsAwaitingPayment(): Promise<CashierPatient[]>

// Récupère factures
fetchAllInvoices(): Promise<InvoiceDetail[]>

// Récupère paiements
fetchAllPayments(): Promise<PaymentRecord[]>

// Crée un paiement
createPayment(data): Promise<PaymentRecord>

// Met à jour statut patient
updatePatientWorkflowStatus(patientId, newStatus): Promise<void>
```

---

## 🖨️ Formats d'impression

### Facture (A5 - 5.8" x 8.3")
Format adapté pour imprimantes thermiques de factures. Format professionnel avec:
- En-tête d'identification de la clinique
- Numéro de facture unique
- Détails patient complets
- Tableau avec article et montant
- Statut de paiement

**Usage** : Imprimer à la taille réelle (100%) sur papier 5.8" x 8.3"

### Historique (A4 - 21 x 29.7 cm)
Rapport complet pour archivage. Contient:
- Résumé avec totals
- Tableau détaillé de tous les enregistrements
- Marges et formatage optimisés pour archivage

**Usage** : Imprimer à la taille réelle (100%) sur papier A4 standard

---

## 🔐 Autorisations requises

- **Role required** : `CASHIER` ou `ADMIN`
- Endpoints protégés par JWT + RolesGuard

---

## 📱 Données affichées

### Patient en attente
```json
{
  "id": "...",
  "firstName": "Jean",
  "lastName": "Dupont",
  "phone": "+243812345678",
  "email": "jean@example.com",
  "workflowStatus": "EN_ATTENTE_DE_PAIEMENT",
  "arrivalAt": "2026-06-12T10:30:00Z",
  "service": "Consultation",
  "receptionist": "Marie Martin",
  "invoice": {
    "id": "...",
    "totalAmount": 20,
    "balanceDue": 20,
    "status": "PENDING",
    "issuedAt": "...",
    "dueDate": "..."
  }
}
```

### Paiement
```json
{
  "id": "...",
  "patientId": "...",
  "patientName": "Jean Dupont",
  "invoiceId": "...",
  "amount": 20,
  "method": "CASH",
  "reference": "D7-JD-1718186400000",
  "paidAt": "2026-06-12T10:45:00Z",
  "createdAt": "..."
}
```

---

## ⚙️ Configuration

### Variables d'environnement requises
- `VITE_API_URL` : URL de base de l'API backend (ex: http://localhost:3000/api)

### Prisma Schema
Les modèles requis :
- `Patient` avec `workflowStatus`
- `Invoice` avec `status`, `type`, `totalAmount`, `balanceDue`
- `Payment` avec `invoiceId`, `amount`, `method`
- Relations : Patient ↔ Invoice ↔ Payment

---

## 🚀 Utilisation

### Pour le caissier
1. **Dashboard** : Accéder au tableau de bord pour voir les dossiers en attente
2. **Traiter** : Cliquer "Traiter le paiement" pour enregistrer le paiement reçu
3. **Valider** : Cliquer "Valider et continuer" pour finaliser et passer au service suivant
4. **Facturation** : Accéder à la page Facturation pour voir l'historique et imprimer les factures
5. **Historique** : Accéder à Historique pour un rapport complet avec possibilité d'imprimer

### Impressions
- **Facture** : Bouton "Imprimer" dans Facturation → Ouvre l'imprimante avec format A5
- **Historique** : Bouton "📄 Imprimer l'historique" → Rapport A4 complet des transactions

---

## 🔄 Rafraîchissement des données

- Dashboard : Rafraîchissement automatique toutes les 30 secondes
- Facturation : Rafraîchissement automatique toutes les 30 secondes
- Historique : Rafraîchissement automatique toutes les 30 secondes

---

## ⚠️ Notes importantes

1. **Frais d'admission fixes** : 20 FC (configuré dans `createAdmission`)
2. **Statuts de workflow** : Utilise les énumérations Prisma
3. **Paiements partiels** : Actuellement, les paiements doivent couvrir le solde complet
4. **Impression** : Utilise `window.print()` natif du navigateur
5. **Authentification** : Les tokens JWT doivent être présents dans localStorage

---

## 📝 Logs et debugging

Tous les appels API incluent des logs console pour debugger :
```
- fetchPatientsAwaitingPayment()
- fetchAllInvoices()
- fetchAllPayments()
- createPayment()
- updatePatientWorkflowStatus()
```

Erreurs affichées dans l'UI :
- Messages d'erreur spécifiques en haut des pages
- Statut de chargement lors des opérations async

---

## 🎯 Prochaines améliorations possibles

- [ ] Paiements partiels
- [ ] Reçus de paiement détaillés
- [ ] Rappels de paiement automatiques
- [ ] Rapports financiers détaillés
- [ ] Export en Excel
- [ ] Intégration systèmes de paiement mobile
