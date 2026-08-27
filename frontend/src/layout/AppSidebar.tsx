import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

// Assume these icons are imported from an icon library
import {
  BoxCubeIcon,
  CalenderIcon,
  ChevronDownIcon,
  GridIcon,
  HorizontaLDots,
  UserCircleIcon,
  TaskIcon,
  TimeIcon,
  DocsIcon,
  ChatIcon,
  FolderIcon,
  DollarLineIcon,
  LockIcon,
  PlusIcon,
} from "../icons";
import { useSidebar } from "../context/SidebarContext";
import { useAuth } from "../context/AuthContext";
import { type AuliaLayer, usePlatformLayers } from "../context/PlatformLayersContext";
import { apiFetch } from "../config/api";
import SidebarWidget from "./SidebarWidget";
import { Modal } from "../components/ui/modal";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
  layers?: AuliaLayer[];
  platformOnly?: boolean;
};

const navItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard principal",
    path: "/",
  },
  {
    icon: <UserCircleIcon />,
    name: "Mon dossier médical",
    path: "/dossier-medical",
  },
  {
    icon: <TaskIcon />,
    name: "Mes traitements",
    path: "/traitements",
  },
  {
    icon: <TimeIcon />,
    name: "Ma montre connectée",
    path: "/montre-connectee",
    layers: ["CONNECTED"],
  },
  {
    icon: <UserCircleIcon />,
    name: "Mes enfants",
    path: "/enfants",
    layers: ["CONNECTED"],
  },
  {
    icon: <CalenderIcon />,
    name: "Rendez-vous",
    path: "/rendez-vous",
  },
  {
    icon: <DocsIcon />,
    name: "Examens & résultats",
    path: "/examens-resultats",
  },
  {
    icon: <BoxCubeIcon />,
    name: "Hospitalisation",
    path: "/hospitalisation",
  },
  {
    icon: <TimeIcon />,
    name: "Suivi quotidien",
    path: "/suivi-quotidien",
    layers: ["AI"],
  },
  {
    icon: <ChatIcon />,
    name: "Messages",
    path: "/messages",
  },
  {
    icon: <FolderIcon />,
    name: "Historique médical",
    path: "/historique-medical",
  },
  {
    icon: <DollarLineIcon />,
    name: "Paiements",
    path: "/paiements",
  },
  {
    icon: <LockIcon />,
    name: "Profil & sécurité",
    path: "/profile",
  },
];

const receptionNavItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard réception",
    path: "/reception",
  },
  {
    icon: <UserCircleIcon />,
    name: "Patients",
    path: "/reception/patients",
  },
  {
    icon: <PlusIcon />,
    name: "Nouvelle admission",
    path: "/reception/admission",
  },
  {
    icon: <CalenderIcon />,
    name: "Rendez-vous",
    path: "/reception/rendez-vous",
  },
  {
    icon: <DollarLineIcon />,
    name: "Services & tarifs",
    path: "/reception/services",
  },
  {
    icon: <DocsIcon />,
    name: "Abonnements",
    path: "/reception/abonnements",
  },
  {
    icon: <BoxCubeIcon />,
    name: "Montres connectées",
    path: "/reception/montres",
    layers: ["CONNECTED"],
  },
  {
    icon: <BoxCubeIcon />,
    name: "Hospitalisations",
    path: "/reception/hospitalisations",
  },
  {
    icon: <ChatIcon />,
    name: "Messages internes",
    path: "/reception/messages",
  },
  {
    icon: <FolderIcon />,
    name: "Historique admissions",
    path: "/reception/historique",
  },
  {
    icon: <LockIcon />,
    name: "Compte réception",
    path: "/reception/profile",
  },
];

const nurseNavItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard soins",
    path: "/nurse",
  },
  {
    icon: <UserCircleIcon />,
    name: "Patients assignés",
    path: "/nurse/patients",
  },
  {
    icon: <CalenderIcon />,
    name: "Tournées & horaires",
    path: "/nurse/rounds",
  },
  {
    icon: <ChatIcon />,
    name: "Communication médecin",
    path: "/nurse/messages",
  },
  {
    icon: <BoxCubeIcon />,
    name: "Hospitalisations suivies",
    path: "/nurse/hospitalized",
  },
  {
    icon: <LockIcon />,
    name: "Profil infirmier",
    path: "/nurse/profile",
  },
];

const doctorNavItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard médical",
    path: "/doctor",
  },
  {
    icon: <UserCircleIcon />,
    name: "Patients",
    path: "/doctor/patients",
  },
  {
    icon: <TaskIcon />,
    name: "Consultations",
    path: "/doctor/consultations",
  },
  {
    icon: <DocsIcon />,
    name: "Brouillons",
    path: "/doctor/drafts",
  },
  {
    icon: <DocsIcon />,
    name: "Prescriptions",
    path: "/doctor/prescriptions",
  },
  {
    icon: <PlusIcon />,
    name: "Examens demandés",
    path: "/doctor/exams",
  },
  {
    icon: <BoxCubeIcon />,
    name: "Hospitalisations",
    path: "/doctor/hospitalizations",
  },
  {
    icon: <LockIcon />,
    name: "Bloc opératoire",
    path: "/doctor/surgery",
  },
  {
    icon: <ChatIcon />,
    name: "Messages médicaux",
    path: "/doctor/messages",
  },
  {
    icon: <LockIcon />,
    name: "Profil médecin",
    path: "/doctor/profile",
  },
];

const cashierNavItems: NavItem[] = [
  {
    icon: <DollarLineIcon />,
    name: "Dashboard caisse",
    path: "/caissier",
  },
  {
    icon: <DollarLineIcon />,
    name: "Facturation",
    path: "/caissier/facturation",
  },
   {
    icon: <ChatIcon />,
    name: "Messages caisse",
    path: "/caissier/messages",
  },
  {
    icon: <FolderIcon />,
    name: "Historique paiements",
    path: "/caissier/historique",
  },
  {
    icon: <LockIcon />,
    name: "Profil caissier",
    path: "/caissier/profile",
  },
];

const financeNavItems: NavItem[] = [
  { icon: <DollarLineIcon />, name: "Tableau de bord", path: "/finance" },
  { icon: <FolderIcon />, name: "Trésorerie & opérations", path: "/finance/tresorerie" },
  { icon: <TaskIcon />, name: "Budgets & investissements", path: "/finance/budgets" },
  { icon: <ChatIcon />, name: "Messages", path: "/finance/messages" },
  { icon: <LockIcon />, name: "Profil finance", path: "/finance/profile" },
];

const radiologyNavItems: NavItem[] = [
  { icon: <GridIcon />, name: "Dashboard Radiologie", path: "/radiologie" },
  { icon: <FolderIcon />, name: "File d'attente", path: "/radiologie/file-attente" },
  { icon: <DocsIcon />, name: "Workflow PACS / RIS", path: "/radiologie/workflow" },
  { icon: <TaskIcon />, name: "Catalogue & tarification", path: "/radiologie/catalogue" },
  { icon: <BoxCubeIcon />, name: "Équipements & maintenance", path: "/radiologie/equipements" },
  { icon: <CalenderIcon />, name: "Planning & agenda", path: "/radiologie/planning" },
  { icon: <TaskIcon />, name: "Dossiers & historique", path: "/radiologie/historique" },
  { icon: <DocsIcon />, name: "Rapports & analyses", path: "/radiologie/rapports" },
  { icon: <ChatIcon />, name: "Messages & communication", path: "/radiologie/messages" },
  { icon: <LockIcon />, name: "Profil & paramètres", path: "/radiologie/profile" },
];

const administrationNavItems: NavItem[] = [
  { icon: <GridIcon />, name: "Dashboard admin", path: "/administration" },
  { icon: <UserCircleIcon />, name: "Personnel", path: "/administration/personnel" },
  { icon: <BoxCubeIcon />, name: "Services", path: "/administration/services" },
  { icon: <FolderIcon />, name: "Departements", path: "/administration/departements" },
  { icon: <CalenderIcon />, name: "Salles & lits", path: "/administration/salles" },
  { icon: <ChatIcon />, name: "Messages admin", path: "/administration/messages" },
  { icon: <DocsIcon />, name: "Rapports", path: "/administration/rapports" },
  { icon: <TaskIcon />, name: "Stock pharmacie", path: "/administration/stock" },
  { icon: <DocsIcon />, name: "Identité de l'hôpital", path: "/administration/identite" },
  { icon: <BoxCubeIcon />, name: "Montres Aulia", path: "/administration/montres", layers: ["CONNECTED"] },
  { icon: <LockIcon />, name: "Profil admin", path: "/administration/profile" },
];

const pharmacyNavItems: NavItem[] = [
  { icon: <GridIcon />, name: "Dashboard pharmacie", path: "/pharmacie" },
  { icon: <TaskIcon />, name: "Delivrance", path: "/pharmacie/delivrance" },
  { icon: <FolderIcon />, name: "Historique", path: "/pharmacie/historique" },
  { icon: <BoxCubeIcon />, name: "Stock", path: "/pharmacie/stock" },
  { icon: <ChatIcon />, name: "Messages", path: "/pharmacie/messages" },
  { icon: <LockIcon />, name: "Profil pharmacie", path: "/pharmacie/profile" },
];

const laboratoryNavItemsFactory = (isLabManager: boolean): NavItem[] => [
  { icon: <GridIcon />, name: "Dashboard laboratoire", path: "/laboratoire" },
  ...(isLabManager ? [{ icon: <DocsIcon />, name: "Catalogue laboratoire", path: "/laboratoire/catalogue" }] : []),
  { icon: <TaskIcon />, name: "Activité laboratoire", path: "/laboratoire/activite" },
  { icon: <DocsIcon />, name: "Validations", path: "/laboratoire/validations" },
  ...(isLabManager ? [{ icon: <UserCircleIcon />, name: "Techniciens", path: "/laboratoire/techniciens" }] : []),
  { icon: <ChatIcon />, name: "Messages", path: "/laboratoire/messages" },
  { icon: <LockIcon />, name: "Profil laboratoire", path: "/laboratoire/profile" },
];

const superAdminNavItems: NavItem[] = [
  { icon: <GridIcon />, name: "Dashboard DG", path: "/admin" },
  { icon: <ChatIcon />, name: "Messages administrateurs", path: "/admin/messages" },
  { icon: <DocsIcon />, name: "Identité de l'hôpital", path: "/admin/identite" },
  { icon: <LockIcon />, name: "Profil super admin", path: "/admin/profile" },
];

const developerNavItems: NavItem[] = [
  { icon: <BoxCubeIcon />, name: "Couches Aulia Care", path: "/dev/couches", platformOnly: true },
];

const othersItems: NavItem[] = [];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const location = useLocation();

  const { currentUser } = useAuth();
  const { isEnabled, layers } = usePlatformLayers();
  // Before the installation configuration is available, never advertise an
  // optional layer as active. This mirrors the fail-closed route/API policy.
  const activeSubscriptionLabel = (layers.configured ? layers.enabledLayers : ["CORE"])
    .map((layer) => ({ CORE: "Aulia Care Core", AI: "Aulia AI", CONNECTED: "Aulia Connected" })[layer])
    .join(" + ");
  const [clinicBrand, setClinicBrand] = useState<{ name?: string; brandDisplayName?: string | null }>({});
  const isLabManager = Boolean(
    currentUser?.primaryRole === "LAB_MANAGER" ||
    currentUser?.role === "LAB_MANAGER" ||
    currentUser?.serviceResponsabilites?.some((responsability) =>
      responsability?.service?.name?.toLowerCase().includes('laboratoire'),
    ),
  );

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main" | "others";
    index: number;
  } | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    const loadClinicBrand = () => apiFetch<{ name?: string; brandDisplayName?: string | null }>("/administration/clinic-branding")
      .then(setClinicBrand)
      .catch(() => setClinicBrand({}));
    void loadClinicBrand();
    window.addEventListener("aulia:clinic-branding-updated", loadClinicBrand);
    const onBrandingStorage = (event: StorageEvent) => {
      if (event.key === "aulia:clinic-document-branding") void loadClinicBrand();
    };
    window.addEventListener("storage", onBrandingStorage);
    return () => {
      window.removeEventListener("aulia:clinic-branding-updated", loadClinicBrand);
      window.removeEventListener("storage", onBrandingStorage);
    };
  }, [currentUser?.id]);
  const isReceptionSection = location.pathname.startsWith("/reception");
  const isNurseSection = location.pathname.startsWith("/nurse");
  const isDoctorSection = location.pathname.startsWith("/doctor");
  const isCashierSection = location.pathname.startsWith("/caissier");
  const isFinanceSection = location.pathname.startsWith("/finance");
  const isRadiologySection = location.pathname.startsWith("/radiologie");
  const isAdministrationSection = location.pathname.startsWith("/administration");
  const isPharmacySection = location.pathname.startsWith("/pharmacie");
  const isLaboratorySection = location.pathname.startsWith("/laboratoire");
  const isSuperAdminSection = location.pathname.startsWith("/admin");
  const isDeveloperSection = location.pathname.startsWith("/dev");
  const activeNavItems = isDoctorSection
    ? doctorNavItems
    : isNurseSection
    ? nurseNavItems
    : isReceptionSection
    ? receptionNavItems
    : isCashierSection
    ? cashierNavItems
    : isFinanceSection
    ? financeNavItems
    : isRadiologySection
    ? radiologyNavItems
    : isAdministrationSection
    ? administrationNavItems
    : isPharmacySection
    ? pharmacyNavItems
    : isLaboratorySection
    ? laboratoryNavItemsFactory(isLabManager)
    : isSuperAdminSection
    ? superAdminNavItems
    : isDeveloperSection
    ? developerNavItems
    : navItems;
  const visibleNavItems = activeNavItems;
  const [lockedItem, setLockedItem] = useState<NavItem | null>(null);
  const isLayerLocked = (item: NavItem) => !item.platformOnly && !(item.layers ?? ["CORE"]).every(isEnabled);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
    {}
  );
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // const isActive = (path: string) => location.pathname === path;
  const isActive = useCallback(
    (path: string) => location.pathname === path,
    [location.pathname]
  );

  useEffect(() => {
    let submenuMatched = false;
    ["main", "others"].forEach((menuType) => {
      const items = menuType === "main" ? navItems : othersItems;
      items.forEach((nav, index) => {
        if (nav.subItems) {
          nav.subItems.forEach((subItem) => {
            if (isActive(subItem.path)) {
              setOpenSubmenu({
                type: menuType as "main" | "others",
                index,
              });
              submenuMatched = true;
            }
          });
        }
      });
    });

    if (!submenuMatched) {
      setOpenSubmenu(null);
    }
  }, [location, isActive]);

  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (index: number, menuType: "main" | "others") => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  const renderMenuItems = (items: NavItem[], menuType: "main" | "others") => (
    <ul className="flex flex-col gap-4">
      {items.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index, menuType)}
              className={`menu-item group ${
                openSubmenu?.type === menuType && openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } cursor-pointer ${
                !isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "lg:justify-start"
              }`}
            >
              <span
                className={`menu-item-icon-size  ${
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className="menu-item-text">{nav.name}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ml-auto w-5 h-5 transition-transform duration-200 ${
                    openSubmenu?.type === menuType &&
                    openSubmenu?.index === index
                      ? "rotate-180 text-brand-500"
                      : ""
                  }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              isLayerLocked(nav) ? (
              <button
                type="button"
                onClick={() => setLockedItem(nav)}
                className={`menu-item group ${
                  "menu-item-inactive"
                }`}
                aria-label={`${nav.name} — option non incluse dans cet abonnement`}
              >
                <span
                  className="menu-item-icon-size menu-item-icon-inactive"
                >
                  <span className="relative inline-flex">{nav.icon}<LockIcon className="absolute -bottom-1.5 -right-1.5 size-3.5 rounded-full bg-white p-0.5 text-amber-500 dark:bg-gray-900" /></span>
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <><span className="menu-item-text">{nav.name}</span><span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400"><LockIcon className="size-4" /> Premium</span></>
                )}
              </button>
              ) : (
                <Link
                  to={nav.path}
                  className={`menu-item group ${
                    isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                  }`}
                >
                  <span
                    className={`menu-item-icon-size ${
                      isActive(nav.path)
                        ? "menu-item-icon-active"
                        : "menu-item-icon-inactive"
                    }`}
                  >
                    {nav.icon}
                  </span>
                  {(isExpanded || isHovered || isMobileOpen) && (
                    <span className="menu-item-text">{nav.name}</span>
                  )}
                </Link>
              )
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              ref={(el) => {
                subMenuRefs.current[`${menuType}-${index}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? `${subMenuHeight[`${menuType}-${index}`]}px`
                    : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      to={subItem.path}
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      }`}
                    >
                      {subItem.name}
                      <span className="flex items-center gap-1 ml-auto">
                        {subItem.new && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge`}
                          >
                            new
                          </span>
                        )}
                        {subItem.pro && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge`}
                          >
                            pro
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (<>
    <aside
      className={`fixed top-16 flex h-[calc(100dvh-4rem)] flex-col px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 transition-all duration-300 ease-in-out z-50 border-r border-gray-200 lg:top-0 lg:h-[100dvh] 
        ${
          isExpanded || isMobileOpen
            ? "w-[290px]"
            : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex w-full flex-col items-center justify-center gap-2 py-8 text-center">
        <Link to="/" className="flex items-center justify-center" aria-label="Accueil Aulia Care">
          {isExpanded || isHovered || isMobileOpen ? (
            <>
              <img
                className="dark:hidden"
                src="/images/logo/logo.png"
                alt="Logo"
                width={120}
              />
              <img
                className="hidden dark:block"
                src="/images/logo/logo-dark.png"
                alt="Logo"
                width={120}
              />
            </>
          ) : (
            <img
              src="/images/logo/logo-icon.png"
              alt="Logo"
              width={64}
              height={64}
            />
          )}
        </Link>
        {(isExpanded || isHovered || isMobileOpen) && (
          <p className="max-w-[220px] text-[11px] font-medium tracking-wide text-slate-500 dark:text-slate-400">
            Géré par {clinicBrand.brandDisplayName || clinicBrand.name || "votre établissement"}
          </p>
        )}
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  isReceptionSection
                    ? "INTERFACE RÉCEPTION"
                    : isAdministrationSection
                    ? "ADMINISTRATION"
                    : isPharmacySection
                    ? "PHARMACIE"
                    : isSuperAdminSection
                    ? "SUPER ADMIN"
                    : isDeveloperSection
                    ? "CONFIGURATION DEV"
                    : "PATIENT INTERFACE"
                ) : (
                  <HorizontaLDots className="size-6" />
                )}
              </h2>
              {renderMenuItems(visibleNavItems, "main")}
            </div>
            {othersItems.length > 0 && (
              <div className="">
                <h2
                  className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                    !isExpanded && !isHovered
                      ? "lg:justify-center"
                      : "justify-start"
                  }`}
                >
                  {isExpanded || isHovered || isMobileOpen ? (
                    "Others"
                  ) : (
                    <HorizontaLDots />
                  )}
                </h2>
                {renderMenuItems(othersItems, "others")}
              </div>
            )}
          </div>
        </nav>
        {currentUser?.primaryRole !== "DEV" && (isExpanded || isHovered || isMobileOpen) ? <SidebarWidget /> : null}
      </div>
    </aside>
    <Modal isOpen={Boolean(lockedItem)} onClose={() => setLockedItem(null)} className="max-w-lg p-0">
      <div className="p-6 sm:p-8">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"><LockIcon className="size-6" /></div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-aulia-teal">Abonnement actuel · {activeSubscriptionLabel}</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{lockedItem?.name} n’est pas inclus</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">Cette fonctionnalité nécessite l'abonnement {lockedItem?.layers?.join(" + ")}. Aucun accès ni aucune donnée ne sera ouvert tant que cet abonnement n’est pas activée.</p>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setLockedItem(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Annuler</button>
          <a href={`mailto:chrinovicnyembo009@gmail.com.local?subject=${encodeURIComponent(`Demande d’activation — ${lockedItem?.name || "Aulia Care"}`)}`} className="rounded-xl bg-aulia-teal px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-aulia-teal/90">Contacter le développeur</a>
        </div>
      </div>
    </Modal>
  </>);
};

export default AppSidebar;
