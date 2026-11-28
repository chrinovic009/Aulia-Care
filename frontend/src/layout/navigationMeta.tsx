import {
  Activity, Ambulance, Baby, BadgeCheck, BedDouble, BookOpenCheck, Boxes, Briefcase, Building2, CalendarClock, CalendarHeart, CalendarRange,
  CircleUserRound, ClipboardList, DoorOpen, FilePenLine, FileText, FlaskConical, FolderKanban, HandCoins, HeartPulse, History, Hospital, IdCard,
  KeyRound, Landmark, Layers3, LayoutDashboard, MessageCircle, Microscope, MonitorCheck, Network, NotebookPen, PiggyBank, Pill, Receipt, Scale,
  ScanLine, ShieldCheck, Stethoscope, Syringe, TestTubes, UserCog, UserRoundCheck, Users, Wallet, Watch, type LucideIcon,
} from "lucide-react";

export type BadgeKey =
  | "messages" | "hrSelf" | "hrAdmin" | "hrFinance" | "nurseRounds" | "nursePatients" | "doctorPatients" | "doctorDrafts"
  | "doctorReferrals" | "labActivity" | "labValidations" | "radiologyQueue" | "pharmacyDispense" | "stockLow"
  | "cashierBilling" | "receptionAppointments" | "units";

type Meta = { icon: LucideIcon; tint: string; badge?: BadgeKey };

/** Tint of each family of tabs (icon halo), in the Aulia Care palette. */
const T = {
  home: "from-aulia-teal/20 to-aulia-teal/5 text-aulia-teal",
  care: "from-rose-500/20 to-rose-500/5 text-rose-600 dark:text-rose-300",
  people: "from-sky-500/20 to-sky-500/5 text-sky-600 dark:text-sky-300",
  lab: "from-violet-500/20 to-violet-500/5 text-violet-600 dark:text-violet-300",
  imaging: "from-indigo-500/20 to-indigo-500/5 text-indigo-600 dark:text-indigo-300",
  pharmacy: "from-emerald-500/20 to-emerald-500/5 text-emerald-600 dark:text-emerald-300",
  money: "from-amber-500/25 to-amber-500/5 text-amber-600 dark:text-amber-300",
  talk: "from-cyan-500/20 to-cyan-500/5 text-cyan-600 dark:text-cyan-300",
  admin: "from-slate-500/20 to-slate-500/5 text-slate-600 dark:text-slate-300",
};

/** Icon and counter of every tab, by path: each icon says what the tab is. */
export const NAV_META: Record<string, Meta> = {
  // Patient portal
  "/patient": { icon: LayoutDashboard, tint: T.home }, "/dossier-medical": { icon: FileText, tint: T.care }, "/examens-resultats": { icon: TestTubes, tint: T.lab },
  "/traitements": { icon: Pill, tint: T.pharmacy }, "/rendez-vous": { icon: CalendarHeart, tint: T.people }, "/paiements": { icon: Wallet, tint: T.money },
  "/historique-medical": { icon: History, tint: T.care }, "/suivi-quotidien": { icon: Activity, tint: T.care }, "/hospitalisation": { icon: BedDouble, tint: T.care },
  "/montre-connectee": { icon: Watch, tint: T.talk }, "/enfants": { icon: Baby, tint: T.people }, "/messages": { icon: MessageCircle, tint: T.talk, badge: "messages" },
  "/profil-securite": { icon: KeyRound, tint: T.admin }, "/profile": { icon: CircleUserRound, tint: T.admin }, "/guide": { icon: BookOpenCheck, tint: T.admin },
  // Reception
  "/reception": { icon: LayoutDashboard, tint: T.home }, "/reception/patients": { icon: Users, tint: T.people }, "/reception/admission": { icon: DoorOpen, tint: T.care },
  "/reception/rendez-vous": { icon: CalendarClock, tint: T.people, badge: "receptionAppointments" }, "/reception/services": { icon: Receipt, tint: T.money },
  "/reception/abonnements": { icon: Briefcase, tint: T.money }, "/reception/montres": { icon: Watch, tint: T.talk }, "/reception/hospitalisations": { icon: BedDouble, tint: T.care },
  "/reception/messages": { icon: MessageCircle, tint: T.talk, badge: "messages" }, "/reception/historique": { icon: History, tint: T.admin }, "/reception/profile": { icon: CircleUserRound, tint: T.admin },
  // Nursing
  "/nurse": { icon: LayoutDashboard, tint: T.home }, "/nurse/patients": { icon: HeartPulse, tint: T.care, badge: "nursePatients" }, "/nurse/rounds": { icon: Syringe, tint: T.care, badge: "nurseRounds" },
  "/nurse/hospitalized": { icon: BedDouble, tint: T.care }, "/nurse/messages": { icon: MessageCircle, tint: T.talk, badge: "messages" }, "/nurse/profile": { icon: CircleUserRound, tint: T.admin },
  // Physicians
  "/doctor": { icon: LayoutDashboard, tint: T.home }, "/doctor/patients": { icon: Stethoscope, tint: T.care, badge: "doctorPatients" }, "/doctor/consultations": { icon: ClipboardList, tint: T.care },
  "/doctor/drafts": { icon: NotebookPen, tint: T.admin, badge: "doctorDrafts" }, "/doctor/prescriptions": { icon: FilePenLine, tint: T.pharmacy }, "/doctor/exams": { icon: Microscope, tint: T.lab },
  "/doctor/hospitalizations": { icon: BedDouble, tint: T.care }, "/doctor/surgery": { icon: Hospital, tint: T.care }, "/doctor/messages": { icon: MessageCircle, tint: T.talk, badge: "messages" },
  "/doctor/profile": { icon: CircleUserRound, tint: T.admin }, "/doctor/referrals": { icon: Network, tint: T.talk, badge: "doctorReferrals" }, "/medical-director": { icon: BadgeCheck, tint: T.admin },
  // Cashier
  "/caissier": { icon: LayoutDashboard, tint: T.home }, "/caissier/facturation": { icon: HandCoins, tint: T.money, badge: "cashierBilling" }, "/caissier/messages": { icon: MessageCircle, tint: T.talk, badge: "messages" },
  "/caissier/historique": { icon: History, tint: T.money }, "/caissier/profile": { icon: CircleUserRound, tint: T.admin },
  // Finance
  "/finance": { icon: LayoutDashboard, tint: T.home }, "/finance/tresorerie": { icon: Landmark, tint: T.money }, "/finance/budgets": { icon: PiggyBank, tint: T.money },
  "/finance/rapprochement-unites": { icon: Scale, tint: T.money }, "/finance/rh": { icon: Wallet, tint: T.people, badge: "hrFinance" }, "/finance/messages": { icon: MessageCircle, tint: T.talk, badge: "messages" },
  "/finance/profile": { icon: CircleUserRound, tint: T.admin },
  // Imaging
  "/radiologie": { icon: LayoutDashboard, tint: T.home }, "/radiologie/file-attente": { icon: ScanLine, tint: T.imaging, badge: "radiologyQueue" }, "/radiologie/workflow": { icon: MonitorCheck, tint: T.imaging },
  "/radiologie/catalogue": { icon: Receipt, tint: T.money }, "/radiologie/equipements": { icon: Boxes, tint: T.imaging }, "/radiologie/planning": { icon: CalendarRange, tint: T.people },
  "/radiologie/historique": { icon: History, tint: T.admin }, "/radiologie/rapports": { icon: FileText, tint: T.imaging }, "/radiologie/messages": { icon: MessageCircle, tint: T.talk, badge: "messages" },
  "/radiologie/profile": { icon: CircleUserRound, tint: T.admin },
  // Administration
  "/administration": { icon: LayoutDashboard, tint: T.home }, "/administration/personnel": { icon: UserCog, tint: T.people }, "/administration/rh": { icon: IdCard, tint: T.people, badge: "hrAdmin" },
  "/administration/unites-soins": { icon: Ambulance, tint: T.care }, "/administration/services": { icon: Layers3, tint: T.admin }, "/administration/departements": { icon: Building2, tint: T.admin },
  "/administration/salles": { icon: BedDouble, tint: T.care }, "/administration/messages": { icon: MessageCircle, tint: T.talk, badge: "messages" }, "/administration/rapports": { icon: FolderKanban, tint: T.admin },
  "/administration/rapprochement-unites": { icon: Scale, tint: T.money }, "/administration/stock": { icon: Pill, tint: T.pharmacy, badge: "stockLow" }, "/administration/identite": { icon: Hospital, tint: T.admin },
  "/administration/montres": { icon: Watch, tint: T.talk }, "/administration/profile": { icon: CircleUserRound, tint: T.admin }, "/administration/medical-director": { icon: BadgeCheck, tint: T.admin },
  // Pharmacy
  "/pharmacie": { icon: LayoutDashboard, tint: T.home }, "/pharmacie/delivrance": { icon: Pill, tint: T.pharmacy, badge: "pharmacyDispense" }, "/pharmacie/historique": { icon: History, tint: T.admin },
  "/pharmacie/stock": { icon: Boxes, tint: T.pharmacy, badge: "stockLow" }, "/pharmacie/securite": { icon: ShieldCheck, tint: T.pharmacy }, "/pharmacie/messages": { icon: MessageCircle, tint: T.talk, badge: "messages" },
  "/pharmacie/profile": { icon: CircleUserRound, tint: T.admin },
  // Laboratory
  "/laboratoire": { icon: LayoutDashboard, tint: T.home }, "/laboratoire/catalogue": { icon: Receipt, tint: T.money }, "/laboratoire/activite": { icon: FlaskConical, tint: T.lab, badge: "labActivity" },
  "/laboratoire/validations": { icon: UserRoundCheck, tint: T.lab, badge: "labValidations" }, "/laboratoire/techniciens": { icon: Users, tint: T.people }, "/laboratoire/messages": { icon: MessageCircle, tint: T.talk, badge: "messages" },
  "/laboratoire/profile": { icon: CircleUserRound, tint: T.admin },
  // Super administration, platform, shared
  "/admin": { icon: LayoutDashboard, tint: T.home }, "/admin/messages": { icon: MessageCircle, tint: T.talk, badge: "messages" }, "/admin/rh": { icon: IdCard, tint: T.people, badge: "hrAdmin" },
  "/admin/identite": { icon: Hospital, tint: T.admin }, "/admin/profile": { icon: CircleUserRound, tint: T.admin }, "/admin/medical-director": { icon: BadgeCheck, tint: T.admin },
  "/dev/couches": { icon: Layers3, tint: T.admin }, "/unites": { icon: Ambulance, tint: T.care, badge: "units" }, "/mon-espace-rh": { icon: CalendarHeart, tint: T.people, badge: "hrSelf" },
};

export const metaFor = (path?: string): Meta | undefined => (path ? NAV_META[path] ?? NAV_META[path.replace(/\/$/, "")] : undefined);
