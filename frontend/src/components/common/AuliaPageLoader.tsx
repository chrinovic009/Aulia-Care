import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

const MINIMUM_TRANSITION_MS = 720;

/**
 * Branded route-transition surface. It is deliberately independent from data
 * fetching: it never implies that a clinical record has finished loading.
 */
export default function AuliaPageLoader() {
  const location = useLocation();
  const routeKey = `${location.pathname}${location.search}`;
  const [visible, setVisible] = useState(true);
  const previousRouteRef = useRef<string | null>(null);

  useEffect(() => {
    const isNewRoute = previousRouteRef.current !== routeKey;
    previousRouteRef.current = routeKey;
    if (!isNewRoute) return;

    setVisible(true);
    const timeoutId = window.setTimeout(() => setVisible(false), MINIMUM_TRANSITION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [routeKey]);

  return (
    <div
      className={`aulia-page-loader${visible ? "" : " aulia-page-loader--hidden"}`}
      aria-busy={visible}
      aria-live="polite"
      aria-label="Chargement d’Aulia Care"
    >
      <div className="aulia-page-loader__ambient aulia-page-loader__ambient--teal" />
      <div className="aulia-page-loader__ambient aulia-page-loader__ambient--green" />
      <div className="aulia-page-loader__content">
        <div className="aulia-page-loader__mark" aria-hidden="true">
          <span className="aulia-page-loader__ring aulia-page-loader__ring--outer" />
          <span className="aulia-page-loader__ring aulia-page-loader__ring--inner" />
          <span className="aulia-page-loader__pulse" />
          <img src="/images/logo/icone.png" alt="" className="aulia-page-loader__logo" />
        </div>
        <div className="aulia-page-loader__identity">
          <span className="aulia-page-loader__name">Aulia Care</span>
          <span className="aulia-page-loader__tagline">La technologie au service du soin et de la vie.</span>
        </div>
        <svg className="aulia-page-loader__ecg" viewBox="0 0 250 36" aria-hidden="true">
          <path d="M0 19h47l9-10 10 21 15-28 11 17h31l10-8 10 16 12-8h75" />
        </svg>
        <div className="aulia-page-loader__progress" aria-hidden="true"><span /></div>
        <span className="sr-only">Préparation sécurisée de votre espace de soins.</span>
      </div>
    </div>
  );
}
