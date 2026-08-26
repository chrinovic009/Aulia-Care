import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "swiper/swiper-bundle.css";
import "flatpickr/dist/flatpickr.css";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import { ThemeProvider } from "./context/ThemeContext.tsx";
import { AuthProvider } from "./context/AuthContext.tsx";
import { RealtimeProvider } from "./context/RealtimeContext.tsx";
import { registerSW } from "virtual:pwa-register";
import { installCsrfFetchInterceptor } from "./config/csrfFetch.ts";
import { ActionFeedbackProvider } from "./components/common/ActionFeedbackProvider.tsx";
import { PlatformLayersProvider } from "./context/PlatformLayersContext.tsx";
import SessionLock from "./components/auth/SessionLock.tsx";

installCsrfFetchInterceptor();

registerSW({
  immediate: true,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <PlatformLayersProvider>
          <RealtimeProvider>
            <ActionFeedbackProvider>
              <AppWrapper>
                <App />
                <SessionLock />
              </AppWrapper>
            </ActionFeedbackProvider>
          </RealtimeProvider>
        </PlatformLayersProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
