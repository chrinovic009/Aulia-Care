import { SidebarProvider, useSidebar } from "../context/SidebarContext";
import { Outlet } from "react-router-dom";
import AppHeader from "./AppHeader";
import Backdrop from "./Backdrop";
import AppSidebar from "./AppSidebar";
import { useAuth } from '../context/AuthContext';
import { useSpeechNotifications } from '../hooks/useSpeechNotifications';
import RealtimePageBoundary from "../components/common/RealtimePageBoundary";
import { PatientTelehealthOverlay } from "../components/telehealth/TelehealthCall";

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const { currentUser } = useAuth();
  useSpeechNotifications(currentUser?.id);

  return (
    <div className="min-h-screen xl:flex">
      <div>
        <AppSidebar />
        <Backdrop />
      </div>
      <div
        className={`flex-1 transition-all duration-300 ease-in-out ${
          isExpanded || isHovered ? "lg:ml-[290px]" : "lg:ml-[90px]"
        } ${isMobileOpen ? "ml-0" : ""}`}
      >
        <AppHeader />
        {currentUser?.primaryRole === "PATIENT" && <PatientTelehealthOverlay />}
        <div className="aulia-content-frame mx-auto w-full min-w-0 max-w-[1680px] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <RealtimePageBoundary><Outlet /></RealtimePageBoundary>
        </div>
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
};

export default AppLayout;
