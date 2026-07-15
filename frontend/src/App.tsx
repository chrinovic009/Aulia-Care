import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import SignIn from "./pages/AuthPages/SignIn";
import SignUp from "./pages/AuthPages/SignUp";
import NotFound from "./pages/OtherPage/NotFound";
import UserProfiles from "./pages/UserProfiles";
import Calendar from "./pages/Calendar";
import BasicTables from "./pages/Tables/BasicTables";
import Blank from "./pages/Blank";
import DossierMedical from "./pages/Patient/DossierMedical";
import Hospitalisation from "./pages/Hospitalisation";
import SuiviQuotidien from "./pages/Patient/SuiviQuotidien";
import Messages from "./pages/Patient/Messages";
import MesTraitements from "./pages/Patient/MesTraitements";
import HistoriqueMedical from "./pages/Patient/HistoriqueMedical";
import ReceptionDashboard from "./pages/Reception/Dashboard";
import ReceptionPatients from "./pages/Reception/Patients";
import ReceptionAdmission from "./pages/Reception/Admission";
import ReceptionProfile from "./pages/Reception/ProfileReception";
import ReceptionMessages from "./pages/Reception/MessagesReception";
import HospitalisationReception from "./pages/Reception/HospitalisationReception";
import HistoriqueReception from "./pages/Reception/HistoriqueReception";
import AbonnementsReception from "./pages/Reception/AbonnementsReception";
import DashboardInfirmier from "./pages/Infirmier/DashboardInfirmier";
import PatientAssignes from "./pages/Infirmier/PatientAssignes";
import MessagesInfirmier from "./pages/Infirmier/MessagesInfirmier";
import ProfileInfirmier from "./pages/Infirmier/ProfileInfirmier";
import RoundsInfirmier from "./pages/Infirmier/Rounds";
import HospitalisationInfirmier from "./pages/Infirmier/HospitalisationsSuivi";
import DashboardMedecin from "./pages/Medecin/DashboardMedecin";
import PatientsMedecin from "./pages/Medecin/PatientsMedecin";
import ExamensMedecin from "./pages/Medecin/ExamensMedecin";
import PrescriptionsMedecin from "./pages/Medecin/PrescriptionsMedecin";
import HospitalisationsMedecin from "./pages/Medecin/HospitalisationsMedecin";
import BlocOperatoireMedecin from "./pages/Medecin/BlocOperatoireMedecin";
import MessagesMedecin from "./pages/Medecin/MessagesMedecin";
import DashboardCaissier from "./pages/Caissier/DashboardCaissier";
import MessagesCaissier from "./pages/Caissier/MessagesCaissier";
import FacturationCaissier from "./pages/Caissier/FacturationCaissier";
import HistoriqueCaissier from "./pages/Caissier/HistoriqueCaissier";
import ProfileCaissier from "./pages/Caissier/ProfileCaissier";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import { RequireAuth, RoleGuard, HomeRedirect } from "./components/auth/RequireAuth";
import RendezVousReception from "./pages/Reception/RendezVousReception";
import CreateReceptionService from "./pages/Reception/CreateService";
import DashboardAdmin from "./pages/Administration/DashboardAdmin";
import GestionPersAdmin from "./pages/Administration/GestionPersAdmin";
import GestionServAdmin from "./pages/Administration/GestionServAdmin";
import GestionDepartAdmin from "./pages/Administration/GestionDepartAdmin";
import GestionSalleAdmin from "./pages/Administration/GestionSalleAdmin";
import RapportAdmin from "./pages/Administration/RapportAdmin";
import GestionStockAdmin from "./pages/Administration/GestionStockAdmin";
import ProfilAdmin from "./pages/Administration/ProfileAdmin";
import DashboardPharmacie from "./pages/Pharmacie/DashboardPharmacie";
import DelivrancePharmacie from "./pages/Pharmacie/DelivrancePharmacie";
import HistoriquePharmacie from "./pages/Pharmacie/HistoriquePharmacie";
import GestionStockPharmacie from "./pages/Pharmacie/GestionStockPharmacie";
import MessagesPharmacie from "./pages/Pharmacie/MessagesPharmacie";
import DashboardLaboratoire from "./pages/Laboratoire/DashboardLaboratoire";
import CatalogueLab from "./pages/Laboratoire/CatalogueLab";
import ActivityLab from "./pages/Laboratoire/ActivityLab";
import ValidationsLab from "./pages/Laboratoire/ValidationsLab";
import TechniciensLab from "./pages/Laboratoire/TechniciensLab";
import MessagesLaboratoire from "./pages/Laboratoire/MessagesLaboratoire";
import ProfileLaboratoire from "./pages/Laboratoire/ProfileLab";
import DashboardSupAdmin from "./pages/SuperAdmin/DashboardSupAdmin";
import ProfileSupAdmin from "./pages/SuperAdmin/ProfileSupAdmin";
import ProfilePharmacie from "./pages/Pharmacie/ProfilePharmacie";
import Guide from "./pages/Guide";
import MessagesAdmin from "./pages/Administration/MessagesAdmin";

export default function App() {
  return (
    <>
      <Router>
        <ScrollToTop />
        <Routes>
          {/* Dashboard Layout */}
          <Route element={<RequireAuth><AppLayout /></RequireAuth>}>

            {/* Page d'erreur */}
            <Route path="/blank" element={<Blank />} />
            <Route path="/guide" element={<RoleGuard requiredRoles={["PATIENT"]}><Guide /></RoleGuard>} />

            {/* Page Patient */}
            <Route index path="/" element={<HomeRedirect />} />
            <Route path="/profile" element={<RoleGuard requiredRoles={["PATIENT"]}><UserProfiles /></RoleGuard>} />
            <Route path="/dossier-medical" element={<RoleGuard requiredRoles={["PATIENT"]}><DossierMedical /></RoleGuard>} />
            <Route path="/traitements" element={<RoleGuard requiredRoles={["PATIENT"]}><MesTraitements /></RoleGuard>} />
            <Route path="/rendez-vous" element={<RoleGuard requiredRoles={["PATIENT"]}><Calendar /></RoleGuard>} />
            <Route path="/examens-resultats" element={<RoleGuard requiredRoles={["PATIENT"]}><BasicTables /></RoleGuard>} />
            <Route path="/hospitalisation" element={<RoleGuard requiredRoles={["PATIENT"]}><Hospitalisation /></RoleGuard>} />
            <Route path="/suivi-quotidien" element={<RoleGuard requiredRoles={["PATIENT"]}><SuiviQuotidien /></RoleGuard>} />
            <Route path="/messages" element={<RoleGuard requiredRoles={["PATIENT"]}><Messages /></RoleGuard>} />
            <Route path="/historique-medical" element={<RoleGuard requiredRoles={["PATIENT"]}><HistoriqueMedical /></RoleGuard>} />
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

            {/* Page Caissier */}
            <Route path="/caissier" element={<RoleGuard requiredRoles={["CASHIER"]}><DashboardCaissier /></RoleGuard>} />
            <Route path="/caissier/guide" element={<RoleGuard requiredRoles={["CASHIER"]}><Guide /></RoleGuard>} />
            <Route path="/caissier/messages" element={<RoleGuard requiredRoles={["CASHIER"]}><MessagesCaissier /></RoleGuard>} />
            <Route path="/caissier/facturation" element={<RoleGuard requiredRoles={["CASHIER"]}><FacturationCaissier /></RoleGuard>} />
            <Route path="/caissier/historique" element={<RoleGuard requiredRoles={["CASHIER"]}><HistoriqueCaissier /></RoleGuard>} />
            <Route path="/caissier/profile" element={<RoleGuard requiredRoles={["CASHIER"]}><ProfileCaissier /></RoleGuard>} />

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
      </Router>
    </>
  );
}
