import { SidebarProvider, useSidebar } from "../context/SidebarContext";
import { Outlet } from "react-router-dom";
import AppHeader from "./AppHeader";
import Backdrop from "./Backdrop";
import AppSidebar from "./AppSidebar";
import { useAuth } from '../context/AuthContext';
import { usePlatformLayers } from '../context/PlatformLayersContext';
import { useSpeechNotifications } from '../hooks/useSpeechNotifications';
import RealtimePageBoundary from "../components/common/RealtimePageBoundary";
import { PatientTelehealthOverlay } from "../components/telehealth/TelehealthCall";
import { ShiftHandoverPrompt } from "../components/staff/ShiftHandoverPrompt";
import { useEffect } from "react";
import { OfflineStatusBanner } from "../offline/OfflineStatusBanner";
import { bindOfflineQueue } from "../offline/offlineQueue";

const PatientTelehealthOverlayForDiagnosticAgent: React.FC = () => {
  const { isLoading, isEnabled } = usePlatformLayers();
  if (isLoading || !isEnabled('DIAGNOSTIC')) return null;
  return <PatientTelehealthOverlay />;
};

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const { currentUser } = useAuth();
  useSpeechNotifications(currentUser?.id);
  useEffect(() => { bindOfflineQueue(currentUser?.id ?? null); }, [currentUser?.id]);

  return (
    <div className="min-h-screen flex">
      <div>
        <AppSidebar />
        <Backdrop />
      </div>
      <div
        className={`w-0 min-w-0 flex-1 transition-all duration-300 ease-in-out md:ml-[90px] ${
          isExpanded || isHovered ? "lg:ml-[290px]" : "lg:ml-[90px]"
        } ${isMobileOpen ? "ml-0" : ""}`}
      >
        <AppHeader />
        <OfflineStatusBanner />
        <ShiftHandoverPrompt />
        {currentUser?.primaryRole === "PATIENT" && <PatientTelehealthOverlayForDiagnosticAgent />}
        <div className="aulia-content-frame mx-auto w-full min-w-0 max-w-[1600px] 3xl:px-8 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
