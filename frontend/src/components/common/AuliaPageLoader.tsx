import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/* Aulia Care loading animation (the logo drawn, then its heartbeat):
   - the first screen of a visit plays the full drawing once, then the
     heartbeat loop;
   - every later page change shows the heartbeat loop only, briefly. */
const INTRO_SRC = "/images/loader/aulia-loader-intro.gif";
const LOOP_SRC = "/images/loader/aulia-loader-loop.gif";
const INTRO_MS = 2600; // 65 frames x 40 ms
const ROUTE_MS = 720;
const SEEN_KEY = "aulia:loader-intro-seen";

const introAlreadySeen = () => {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
};

const markIntroSeen = () => {
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private browsing: the drawing simply plays again next time.
  }
};

/**
 * Branded route-transition surface. It is deliberately independent from data
 * fetching: it never implies that a clinical record has finished loading.
 */
export default function AuliaPageLoader() {
  const location = useLocation();
  const routeKey = `${location.pathname}${location.search}`;
  const [visible, setVisible] = useState(true);
  const [playIntro, setPlayIntro] = useState(() => !introAlreadySeen());
  const previousRouteRef = useRef<string | null>(null);
  const firstShowRef = useRef(true);

  useEffect(() => {
    const preload = new Image();
    preload.src = LOOP_SRC;
  }, []);

  useEffect(() => {
    const isNewRoute = previousRouteRef.current !== routeKey;
    previousRouteRef.current = routeKey;
    if (isNewRoute) setVisible(true);

    const withIntro = firstShowRef.current && playIntro;
    firstShowRef.current = false;
    const timeoutId = window.setTimeout(() => {
      setVisible(false);
      if (withIntro) {
        markIntroSeen();
        setPlayIntro(false);
      }
    }, withIntro ? INTRO_MS : ROUTE_MS);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  return (
    <div
      className={`aulia-page-loader${visible ? "" : " aulia-page-loader--hidden"}`}
      aria-busy={visible}
      aria-live="polite"
      aria-label="Chargement d’Aulia Care"
    >
      {visible && (
        <img
          src={playIntro ? INTRO_SRC : LOOP_SRC}
          alt=""
          aria-hidden="true"
          width={176}
          height={176}
          decoding="async"
          className="aulia-page-loader__gif"
        />
      )}
      <span className="sr-only">Préparation sécurisée de votre espace de soins.</span>
    </div>
  );
}
