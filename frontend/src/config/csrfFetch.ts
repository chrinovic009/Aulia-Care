import { API_CONFIG } from "./api";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const INSTALLED = "__auliaCsrfFetchInstalled__";

const readCookie = (name: string) => {
  const prefix = `${name}=`;
  return document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length) || null;
};

const apiBaseUrl = new URL(API_CONFIG.BASE_URL, window.location.origin);
const apiBasePath = apiBaseUrl.pathname.replace(/\/+$/, "") || "/";
const csrfEndpoint = new URL(`${apiBasePath}/auth/csrf`, apiBaseUrl.origin).toString();

const isApiRequest = (input: RequestInfo | URL) => {
  const raw = input instanceof Request ? input.url : String(input);
  const url = new URL(raw, window.location.origin);
  return url.origin === apiBaseUrl.origin
    && (url.pathname === apiBasePath || url.pathname.startsWith(`${apiBasePath}/`));
};

/**
 * Makes the double-submit CSRF control reliable for both apiFetch and legacy
 * direct fetch calls. It only touches Aulia API writes on the configured API
 * origin. Production should expose that API through the hospital's same-origin
 * reverse proxy so that the double-submit cookie remains readable by the SPA.
 */
export function installCsrfFetchInterceptor() {
  const globalWindow = window as Window & { [INSTALLED]?: boolean };
  if (globalWindow[INSTALLED]) return;
  globalWindow[INSTALLED] = true;
  const nativeFetch = window.fetch.bind(window);
  let csrfBootstrap: Promise<void> | null = null;

  const ensureCsrfCookie = async () => {
    if (readCookie("aulia_csrf_token")) return;
    csrfBootstrap ||= nativeFetch(csrfEndpoint, { credentials: "include" })
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => { csrfBootstrap = null; });
    await csrfBootstrap;
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (!UNSAFE_METHODS.has(method) || !isApiRequest(input)) return nativeFetch(input, init);

    await ensureCsrfCookie();
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    const csrfToken = readCookie("aulia_csrf_token");
    if (csrfToken && !headers.has("X-CSRF-Token")) headers.set("X-CSRF-Token", csrfToken);
    return nativeFetch(input, { ...init, headers, credentials: init?.credentials || "include" });
  };
}
