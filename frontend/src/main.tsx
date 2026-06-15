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

registerSW({
  immediate: true,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <RealtimeProvider>
          <AppWrapper>
            <App />
          </AppWrapper>
        </RealtimeProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
