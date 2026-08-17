import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import AuliaPageLoader from "./components/common/AuliaPageLoader";
import { RequireAuth, RoleGuard, HomeRedirect } from "./components/auth/RequireAuth";

const SignIn = lazy(() => import("./pages/AuthPages/SignIn")); const SignUp = lazy(() => import("./pages/AuthPages/SignUp")); const NotFound = lazy(() => import("./pages/OtherPage/NotFound")); const UserProfiles = lazy(() => import("./pages/UserProfiles")); const Blank = lazy(() => import("./pages/Blank")); const DossierMedical = lazy(() => import("./pages/Patient/DossierMedical")); const SuiviQuotidien = lazy(() => import("./pages/Patient/SuiviQuotidien")); const Messages = lazy(() => import("./pages/Patient/Messages")); const MesTraitements = lazy(() => import("./pages/Patient/MesTraitements")); const HistoriqueMedical = lazy(() => import("./pages/Patient/HistoriqueMedical")); const PatientDashboard = lazy(() => import("./pages/Patient/PatientDashboard")); const PatientAppointments = lazy(() => import("./pages/Patient/PatientAppointments")); const PatientResults = lazy(() => import("./pages/Patient/PatientResults")); const PatientHospitalization = lazy(() => import("./pages/Patient/PatientHospitalization")); const PatientPayments = lazy(() => import("./pages/Patient/PatientPayments")); const MontreConnectee = lazy(() => import("./pages/Patient/MontreConnectee")); const MesEnfants = lazy(() => import("./pages/Patient/MesEnfants"));
const ReceptionDashboard = lazy(() => import("./pages/Reception/Dashboard")); const ReceptionPatients = lazy(() => import("./pages/Reception/Patients")); const ReceptionAdmission = lazy(() => import("./pages/Reception/Admission")); const ReceptionProfile = lazy(() => import("./pages/Reception/ProfileReception")); const ReceptionMessages = lazy(() => import("./pages/Reception/MessagesReception")); const HospitalisationReception = lazy(() => import("./pages/Reception/HospitalisationReception")); const HistoriqueReception = lazy(() => import("./pages/Reception/HistoriqueReception")); const AbonnementsReception = lazy(() => import("./pages/Reception/AbonnementsReception")); const RendezVousReception = lazy(() => import("./pages/Reception/RendezVousReception")); const CreateReceptionService = lazy(() => import("./pages/Reception/CreateService"));
const DashboardInfirmier = lazy(() => import("./pages/Infirmier/DashboardInfirmier")); const PatientAssignes = lazy(() => import("./pages/Infirmier/PatientAssignes")); const MessagesInfirmier = lazy(() => import("./pages/Infirmier/MessagesInfirmier")); const ProfileInfirmier = lazy(() => import("./pages/Infirmier/ProfileInfirmier")); const RoundsInfirmier = lazy(() => import("./pages/Infirmier/Rounds")); const HospitalisationInfirmier = lazy(() => import("./pages/Infirmier/HospitalisationsSuivi"));
const DashboardMedecin = lazy(() => import("./pages/Medecin/DashboardMedecin")); const PatientsMedecin = lazy(() => import("./pages/Medecin/PatientsMedecin")); const ExamensMedecin = lazy(() => import("./pages/Medecin/ExamensMedecin")); const PrescriptionsMedecin = lazy(() => import("./pages/Medecin/PrescriptionsMedecin")); const HospitalisationsMedecin = lazy(() => import("./pages/Medecin/HospitalisationsMedecin")); const BlocOperatoireMedecin = lazy(() => import("./pages/Medecin/BlocOperatoireMedecin")); const MessagesMedecin = lazy(() => import("./pages/Medecin/MessagesMedecin")); const ProfileMedecin = lazy(() => import("./pages/Medecin/ProfileMedecin"));
const DashboardCaissier = lazy(() => import("./pages/Caissier/DashboardCaissier")); const MessagesCaissier = lazy(() => import("./pages/Caissier/MessagesCaissier")); const FacturationCaissier = lazy(() => import("./pages/Caissier/FacturationCaissier")); const HistoriqueCaissier = lazy(() => import("./pages/Caissier/HistoriqueCaissier")); const ProfileCaissier = lazy(() => import("./pages/Caissier/ProfileCaissier"));
const DashboardAdmin = lazy(() => import("./pages/Administration/DashboardAdmin")); const GestionPersAdmin = lazy(() => import("./pages/Administration/GestionPersAdmin")); const GestionServAdmin = lazy(() => import("./pages/Administration/GestionServAdmin")); const GestionDepartAdmin = lazy(() => import("./pages/Administration/GestionDepartAdmin")); const GestionSalleAdmin = lazy(() => import("./pages/Administration/GestionSalleAdmin")); const RapportAdmin = lazy(() => import("./pages/Administration/RapportAdmin")); const GestionStockAdmin = lazy(() => import("./pages/Administration/GestionStockAdmin")); const ProfilAdmin = lazy(() => import("./pages/Administration/ProfileAdmin")); const MessagesAdmin = lazy(() => import("./pages/Administration/MessagesAdmin"));
const DashboardPharmacie = lazy(() => import("./pages/Pharmacie/DashboardPharmacie")); const DelivrancePharmacie = lazy(() => import("./pages/Pharmacie/DelivrancePharmacie")); const HistoriquePharmacie = lazy(() => import("./pages/Pharmacie/HistoriquePharmacie")); const GestionStockPharmacie = lazy(() => import("./pages/Pharmacie/GestionStockPharmacie")); const MessagesPharmacie = lazy(() => import("./pages/Pharmacie/MessagesPharmacie")); const ProfilePharmacie = lazy(() => import("./pages/Pharmacie/ProfilePharmacie"));
const DashboardLaboratoire = lazy(() => import("./pages/Laboratoire/DashboardLaboratoire")); const CatalogueLab = lazy(() => import("./pages/Laboratoire/CatalogueLab")); const ActivityLab = lazy(() => import("./pages/Laboratoire/ActivityLab")); const ValidationsLab = lazy(() => import("./pages/Laboratoire/ValidationsLab")); const TechniciensLab = lazy(() => import("./pages/Laboratoire/TechniciensLab")); const MessagesLaboratoire = lazy(() => import("./pages/Laboratoire/MessagesLaboratoire")); const ProfileLaboratoire = lazy(() => import("./pages/Laboratoire/ProfileLab"));
const DashboardSupAdmin = lazy(() => import("./pages/SuperAdmin/DashboardSupAdmin")); const ProfileSupAdmin = lazy(() => import("./pages/SuperAdmin/ProfileSupAdmin")); const Guide = lazy(() => import("./pages/Guide")); const DashboardFinance = lazy(() => import("./pages/Finance/DashboardFinance")); const MessagesFinance = lazy(() => import("./pages/Finance/MessagesFinance")); const ProfileFinance = lazy(() => import("./pages/Finance/ProfileFinance"));
const DashboardRadio = lazy(() => import("./pages/Radiologie/DashboardRadio")); const WaitingQueueRadio = lazy(() => import("./pages/Radiologie/WaitingQueueRadio")); const WorkflowRadio = lazy(() => import("./pages/Radiologie/WorkflowRadio")); const CatalogueRadio = lazy(() => import("./pages/Radiologie/CatalogueRadio")); const EquipmentRadio = lazy(() => import("./pages/Radiologie/EquipmentRadio")); const SchedulingRadio = lazy(() => import("./pages/Radiologie/SchedulingRadio")); const HistoryRadio = lazy(() => import("./pages/Radiologie/HistoryRadio")); const ReportsRadio = lazy(() => import("./pages/Radiologie/ReportsRadio")); const MessagesRadio = lazy(() => import("./pages/Radiologie/MessagesRadio")); const ProfileRadio = lazy(() => import("./pages/Radiologie/ProfileRadio"));

export default function App() {
  return (
    <>
      <Router>
        <AuliaPageLoader />
        <ScrollToTop />
        <Suspense fallback={<div className="grid min-h-[45vh] place-items-center text-sm text-slate-500 dark:text-slate-300">Chargement sécurisé de l’espace Aulia Care…</div>}>
        <Routes>
          {/* Dashboard Layout */}
          <Route element={<RequireAuth><AppLayout /></RequireAuth>}>

            {/* Page d'erreur */}
            <Route path="/blank" element={<Blank />} />
            <Route path="/guide" element={<RoleGuard requiredRoles={["PATIENT"]}><Guide /></RoleGuard>} />

            {/* Page Patient */}
            <Route index path="/" element={<HomeRedirect />} />
            <Route path="/profile" element={<RoleGuard requiredRoles={["PATIENT"]}><UserProfiles /></RoleGuard>} />
            <Route path="/patient" element={<RoleGuard requiredRoles={["PATIENT"]}><PatientDashboard /></RoleGuard>} />
            <Route path="/dossier-medical" element={<RoleGuard requiredRoles={["PATIENT"]}><DossierMedical /></RoleGuard>} />
            <Route path="/traitements" element={<RoleGuard requiredRoles={["PATIENT"]}><MesTraitements /></RoleGuard>} />
            <Route path="/rendez-vous" element={<RoleGuard requiredRoles={["PATIENT"]}><PatientAppointments /></RoleGuard>} />
            <Route path="/examens-resultats" element={<RoleGuard requiredRoles={["PATIENT"]}><PatientResults /></RoleGuard>} />
            <Route path="/hospitalisation" element={<RoleGuard requiredRoles={["PATIENT"]}><PatientHospitalization /></RoleGuard>} />
            <Route path="/suivi-quotidien" element={<RoleGuard requiredRoles={["PATIENT"]}><SuiviQuotidien /></RoleGuard>} />
            <Route path="/montre-connectee" element={<RoleGuard requiredRoles={["PATIENT"]}><MontreConnectee /></RoleGuard>} />
            <Route path="/enfants" element={<RoleGuard requiredRoles={["PATIENT"]}><MesEnfants /></RoleGuard>} />
            <Route path="/messages" element={<RoleGuard requiredRoles={["PATIENT"]}><Messages /></RoleGuard>} />
            <Route path="/historique-medical" element={<RoleGuard requiredRoles={["PATIENT"]}><HistoriqueMedical /></RoleGuard>} />
            <Route path="/paiements" element={<RoleGuard requiredRoles={["PATIENT"]}><PatientPayments /></RoleGuard>} />
            <Route path="/profil-securite" element={<RoleGuard requiredRoles={["PATIENT"]}><UserProfiles /></RoleGuard>} />
            
            {/* Page Receptioniste */}
            <Route path="/reception" element={<RoleGuard requiredRoles={["RECEPTIONIST"]}><ReceptionDashboard /></RoleGuard>} />
            <Route path="/reception/guide" element={<RoleGuard requiredRoles={["RECEPTIONIST"]}><Guide /></RoleGuard>} />
            <Route path="/reception/patients" element={<RoleGuard requiredRoles={["RECEPTIONIST"]}><ReceptionPatients /></RoleGuard>} />
            <Route path="/reception/admission" element={<RoleGuard requiredRoles={["RECEPTIONIST"]}><ReceptionAdmission /></RoleGuard>} />
            <Route path="/reception/rendez-vous" element={<RoleGuard requiredRoles={["RECEPTIONIST"]}><RendezVousReception /></RoleGuard>} />
            <Route path="/reception/services" element={<RoleGuard requiredRoles={["RECEPTIONIST"]}><CreateReceptionService /></RoleGuard>} />
            <Route path="/reception/abonnements" element={<RoleGuard requiredRoles={["RECEPTIONIST"]}><AbonnementsReception /></RoleGuard>} />
            <Route path="/reception/hospitalisations" element={<RoleGuard requiredRoles={["RECEPTIONIST"]}><HospitalisationReception /></RoleGuard>} />
            <Route path="/reception/messages" element={<RoleGuard requiredRoles={["RECEPTIONIST"]}><ReceptionMessages /></RoleGuard>} />
            <Route path="/reception/historique" element={<RoleGuard requiredRoles={["RECEPTIONIST"]}><HistoriqueReception /></RoleGuard>} />
            <Route path="/reception/profile" element={<RoleGuard requiredRoles={["RECEPTIONIST"]}><ReceptionProfile /></RoleGuard>} />

            {/* Page Infirmier */}
            <Route path="/nurse" element={<RoleGuard requiredRoles={["NURSE"]}><DashboardInfirmier /></RoleGuard>} />
            <Route path="/nurse/guide" element={<RoleGuard requiredRoles={["NURSE"]}><Guide /></RoleGuard>} />
            <Route path="/nurse/patients" element={<RoleGuard requiredRoles={["NURSE"]}><PatientAssignes /></RoleGuard>} />
            <Route path="/nurse/rounds" element={<RoleGuard requiredRoles={["NURSE"]}><RoundsInfirmier /></RoleGuard>} />
            <Route path="/nurse/hospitalized" element={<RoleGuard requiredRoles={["NURSE"]}><HospitalisationInfirmier /></RoleGuard>} />
            <Route path="/nurse/messages" element={<RoleGuard requiredRoles={["NURSE"]}><MessagesInfirmier /></RoleGuard>} />
            <Route path="/nurse/profile" element={<RoleGuard requiredRoles={["NURSE"]}><ProfileInfirmier /></RoleGuard>} />

            {/* Page Médecin */}
            <Route path="/doctor/" element={<RoleGuard requiredRoles={["PHYSICIAN"]}><DashboardMedecin /></RoleGuard>} />
            <Route path="/doctor/guide" element={<RoleGuard requiredRoles={["PHYSICIAN"]}><Guide /></RoleGuard>} />
            <Route path="/doctor/patients" element={<RoleGuard requiredRoles={["PHYSICIAN"]}><PatientsMedecin /></RoleGuard>} />
            <Route path="/doctor/consultations" element={<RoleGuard requiredRoles={["PHYSICIAN"]}><DashboardMedecin /></RoleGuard>} />
            <Route path="/doctor/prescriptions" element={<RoleGuard requiredRoles={["PHYSICIAN"]}><PrescriptionsMedecin /></RoleGuard>} />
            <Route path="/doctor/exams" element={<RoleGuard requiredRoles={["PHYSICIAN"]}><ExamensMedecin /></RoleGuard>} />
            <Route path="/doctor/hospitalizations" element={<RoleGuard requiredRoles={["PHYSICIAN"]}><HospitalisationsMedecin /></RoleGuard>} />
            <Route path="/doctor/surgery" element={<RoleGuard requiredRoles={["PHYSICIAN"]}><BlocOperatoireMedecin /></RoleGuard>} />
            <Route path="/doctor/messages" element={<RoleGuard requiredRoles={["PHYSICIAN"]}><MessagesMedecin /></RoleGuard>} />
            <Route path="/doctor/profile" element={<RoleGuard requiredRoles={["PHYSICIAN"]}><ProfileMedecin /></RoleGuard>} />

            {/* Page Caissier */}
            <Route path="/caissier" element={<RoleGuard requiredRoles={["CASHIER"]}><DashboardCaissier /></RoleGuard>} />
            <Route path="/caissier/guide" element={<RoleGuard requiredRoles={["CASHIER"]}><Guide /></RoleGuard>} />
            <Route path="/caissier/messages" element={<RoleGuard requiredRoles={["CASHIER"]}><MessagesCaissier /></RoleGuard>} />
            <Route path="/caissier/facturation" element={<RoleGuard requiredRoles={["CASHIER"]}><FacturationCaissier /></RoleGuard>} />
            <Route path="/caissier/historique" element={<RoleGuard requiredRoles={["CASHIER"]}><HistoriqueCaissier /></RoleGuard>} />
            <Route path="/caissier/profile" element={<RoleGuard requiredRoles={["CASHIER"]}><ProfileCaissier /></RoleGuard>} />

            {/* Finance */}
            <Route path="/finance" element={<RoleGuard requiredRoles={["FINANCE"]}><DashboardFinance /></RoleGuard>} />
            <Route path="/finance/messages" element={<RoleGuard requiredRoles={["FINANCE"]}><MessagesFinance /></RoleGuard>} />
            <Route path="/finance/profile" element={<RoleGuard requiredRoles={["FINANCE"]}><ProfileFinance /></RoleGuard>} />

            {/* Radiologie */}
            <Route path="/radiologie" element={<RoleGuard requiredRoles={["RADIOLOGIST"]}><DashboardRadio /></RoleGuard>} />
            <Route path="/radiologie/file-attente" element={<RoleGuard requiredRoles={["RADIOLOGIST"]}><WaitingQueueRadio /></RoleGuard>} />
            <Route path="/radiologie/workflow" element={<RoleGuard requiredRoles={["RADIOLOGIST"]}><WorkflowRadio /></RoleGuard>} />
            <Route path="/radiologie/catalogue" element={<RoleGuard requiredRoles={["RADIOLOGIST"]}><CatalogueRadio /></RoleGuard>} />
            <Route path="/radiologie/equipements" element={<RoleGuard requiredRoles={["RADIOLOGIST"]}><EquipmentRadio /></RoleGuard>} />
            <Route path="/radiologie/planning" element={<RoleGuard requiredRoles={["RADIOLOGIST"]}><SchedulingRadio /></RoleGuard>} />
            <Route path="/radiologie/historique" element={<RoleGuard requiredRoles={["RADIOLOGIST"]}><HistoryRadio /></RoleGuard>} />
            <Route path="/radiologie/rapports" element={<RoleGuard requiredRoles={["RADIOLOGIST"]}><ReportsRadio /></RoleGuard>} />
            <Route path="/radiologie/messages" element={<RoleGuard requiredRoles={["RADIOLOGIST"]}><MessagesRadio /></RoleGuard>} />
            <Route path="/radiologie/profile" element={<RoleGuard requiredRoles={["RADIOLOGIST"]}><ProfileRadio /></RoleGuard>} />

            {/* Administration clinique */}
            <Route path="/administration" element={<RoleGuard requiredRoles={["ADMIN"]}><DashboardAdmin /></RoleGuard>} />
            <Route path="/administration/guide" element={<RoleGuard requiredRoles={["ADMIN"]}><Guide /></RoleGuard>} />
            <Route path="/administration/personnel" element={<RoleGuard requiredRoles={["ADMIN"]}><GestionPersAdmin /></RoleGuard>} />
            <Route path="/administration/services" element={<RoleGuard requiredRoles={["ADMIN"]}><GestionServAdmin /></RoleGuard>} />
            <Route path="/administration/departements" element={<RoleGuard requiredRoles={["ADMIN"]}><GestionDepartAdmin /></RoleGuard>} />
            <Route path="/administration/salles" element={<RoleGuard requiredRoles={["ADMIN"]}><GestionSalleAdmin /></RoleGuard>} />
            <Route path="/administration/messages" element={<RoleGuard requiredRoles={["ADMIN"]}><MessagesAdmin /></RoleGuard>} />
            <Route path="/administration/rapports" element={<RoleGuard requiredRoles={["ADMIN"]}><RapportAdmin /></RoleGuard>} />
            <Route path="/administration/stock" element={<RoleGuard requiredRoles={["ADMIN"]}><GestionStockAdmin /></RoleGuard>} />
            <Route path="/administration/profile" element={<RoleGuard requiredRoles={["ADMIN"]}><ProfilAdmin /></RoleGuard>} />

            {/* Pharmacie */}
            <Route path="/pharmacie" element={<RoleGuard requiredRoles={["PHARMACIST"]}><DashboardPharmacie /></RoleGuard>} />
            <Route path="/pharmacie/guide" element={<RoleGuard requiredRoles={["PHARMACIST"]}><Guide /></RoleGuard>} />
            <Route path="/pharmacie/delivrance" element={<RoleGuard requiredRoles={["PHARMACIST"]}><DelivrancePharmacie /></RoleGuard>} />
            <Route path="/pharmacie/historique" element={<RoleGuard requiredRoles={["PHARMACIST"]}><HistoriquePharmacie /></RoleGuard>} />
            <Route path="/pharmacie/stock" element={<RoleGuard requiredRoles={["PHARMACIST"]}><GestionStockPharmacie /></RoleGuard>} />
            <Route path="/pharmacie/messages" element={<RoleGuard requiredRoles={["PHARMACIST"]}><MessagesPharmacie /></RoleGuard>} />
            <Route path="/pharmacie/profile" element={<RoleGuard requiredRoles={["PHARMACIST"]}><ProfilePharmacie /></RoleGuard>} />

            {/* Laboratoire */}
            <Route path="/laboratoire" element={<RoleGuard requiredRoles={["LAB_TECHNICIAN", "LAB_MANAGER"]}><DashboardLaboratoire /></RoleGuard>} />
            <Route path="/laboratoire/guide" element={<RoleGuard requiredRoles={["LAB_TECHNICIAN", "LAB_MANAGER"]}><Guide /></RoleGuard>} />
            <Route path="/laboratoire/activite" element={<RoleGuard requiredRoles={["LAB_TECHNICIAN", "LAB_MANAGER"]}><ActivityLab /></RoleGuard>} />
            <Route path="/laboratoire/validations" element={<RoleGuard requiredRoles={["LAB_TECHNICIAN", "LAB_MANAGER"]}><ValidationsLab /></RoleGuard>} />
            <Route path="/laboratoire/techniciens" element={<RoleGuard requiredRoles={["LAB_MANAGER"]}><TechniciensLab /></RoleGuard>} />
            <Route path="/laboratoire/catalogue" element={<RoleGuard requiredRoles={["LAB_MANAGER"]}><CatalogueLab /></RoleGuard>} />
            <Route path="/laboratoire/messages" element={<RoleGuard requiredRoles={["LAB_TECHNICIAN", "LAB_MANAGER"]}><MessagesLaboratoire /></RoleGuard>} />
            <Route path="/laboratoire/profile" element={<RoleGuard requiredRoles={["LAB_TECHNICIAN", "LAB_MANAGER"]}><ProfileLaboratoire /></RoleGuard>} />

            {/* Super Admin */}
            <Route path="/admin" element={<RoleGuard requiredRoles={["SUPER_ADMIN"]}><DashboardSupAdmin /></RoleGuard>} />
            <Route path="/admin/guide" element={<RoleGuard requiredRoles={["SUPER_ADMIN"]}><Guide /></RoleGuard>} />
            <Route path="/admin/profile" element={<RoleGuard requiredRoles={["SUPER_ADMIN"]}><ProfileSupAdmin /></RoleGuard>} />

          </Route>

          {/* Auth Layout */}
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />

          {/* Fallback Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </Router>
    </>
  );
}
