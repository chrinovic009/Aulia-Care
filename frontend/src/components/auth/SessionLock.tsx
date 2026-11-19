import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../config/api";
import { useAuth } from "../../context/AuthContext";

const minutesKey = (userId?: string) =>
  `aulia.session-lock.minutes.${userId || "anonymous"}`;

const requiredKey = (userId?: string) =>
  `aulia.session-lock.required.${userId || "anonymous"}`;

const freshAuthenticationKey = (userId?: string) =>
  `aulia.fresh-auth.${userId || "anonymous"}`;

export function setSessionLockMinutes(
  userId: string,
  minutes: number,
) {
  localStorage.setItem(
    minutesKey(userId),
    String(minutes),
  );

  window.dispatchEvent(
    new CustomEvent("aulia:session-lock-setting", {
      detail: { userId, minutes },
    }),
  );
}

const persistLock = (userId: string) =>
  localStorage.setItem(
    requiredKey(userId),
    "required",
  );

const clearLock = (userId: string) =>
  localStorage.removeItem(
    requiredKey(userId),
  );

export default function SessionLock() {
  const {
    currentUser,
    sessionSecurityState,
    setSessionSecurityState,
  } = useAuth();

  const [minutes, setMinutes] = useState(0);
  const [locked, setLocked] = useState(false);
  const [checkingPin, setCheckingPin] =
    useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] =
    useState<string | null>(null);

  const timer = useRef<number | null>(null);
  const hasPin = useRef(false);

  /**
   * Verrouille explicitement la session.
   *
   * L'overlay protège immédiatement l'interface,
   * mais le serveur reste la véritable frontière
   * de sécurité.
   */
  const lockNow = () => {
    if (
      !currentUser?.id ||
      !hasPin.current
    ) {
      return;
    }

    persistLock(currentUser.id);
    setLocked(true);
    setSessionSecurityState("LOCKED");

    void apiFetch(
      "/auth/lock-session",
      {
        method: "POST",
      },
    ).catch(() => {
      // Fail closed.
      setSessionSecurityState("LOCKED");

      setError(
        "Le verrouillage serveur n’a pas pu être confirmé. Rechargez la page ou reconnectez-vous.",
      );
    });
  };

  /**
   * Initialise SessionLock uniquement lorsque
   * l'utilisateur authentifié change.
   *
   * IMPORTANT :
   * cet effet ne dépend volontairement PAS de
   * sessionSecurityState.
   *
   * Ainsi, une validation correcte du PIN peut
   * faire LOCKED -> UNLOCKED sans provoquer une
   * nouvelle initialisation et un reverrouillage.
   */
  useEffect(() => {
    const userId = currentUser?.id;

    hasPin.current = false;
    setPin("");
    setError(null);

    if (!userId) {
      setLocked(false);
      setCheckingPin(false);
      return;
    }

    let cancelled = false;

    const loadSecurityState = async () => {
      setCheckingPin(true);

      try {
        const status =
          await apiFetch<{
            hasPin: boolean;
          }>(
            "/auth/security-status",
          );

        if (cancelled) return;

        hasPin.current =
          Boolean(status?.hasPin);

        /**
         * Aucun PIN configuré :
         * aucune raison de maintenir l'overlay.
         */
        if (!status?.hasPin) {
          clearLock(userId);
          setLocked(false);
          setSessionSecurityState(
            "UNLOCKED",
          );
          return;
        }

        /**
         * Une authentification par mot de passe
         * vient juste d'être effectuée.
         *
         * Elle constitue déjà une authentification
         * fraîche. Le PIN n'est donc pas redemandé
         * immédiatement.
         */
        const isFreshPasswordLogin =
          sessionStorage.getItem(
            freshAuthenticationKey(userId),
          ) === "1";

        if (isFreshPasswordLogin) {
          sessionStorage.removeItem(
            freshAuthenticationKey(userId),
          );

          clearLock(userId);
          setLocked(false);
          setSessionSecurityState(
            "UNLOCKED",
          );

          return;
        }

        /**
         * Pour une session restaurée possédant un PIN,
         * AuthContext a déjà déterminé l'état de sécurité.
         *
         * Si elle est LOCKED, SessionLock se contente
         * d'afficher l'overlay.
         *
         * Il ne rappelle PAS /auth/lock-session.
         */
        if (
          sessionSecurityState ===
          "LOCKED"
        ) {
          persistLock(userId);
          setLocked(true);
          return;
        }

        /**
         * Si AuthContext est encore en train de déterminer
         * l'état de sécurité, on reste fermé.
         *
         * Aucun endpoint métier ne doit devenir accessible
         * pendant cette période.
         */
        if (
          sessionSecurityState ===
          "CHECKING"
        ) {
          persistLock(userId);
          setLocked(true);
          return;
        }

        /**
         * UNLOCKED est ici un état autoritaire.
         *
         * Il peut provenir :
         * - d'une authentification fraîche ;
         * - d'une validation correcte du PIN.
         *
         * SessionLock ne doit donc surtout pas
         * reverrouiller la session.
         */
        clearLock(userId);
        setLocked(false);
      } catch {
        if (!cancelled) {
          /**
           * Fail closed :
           * impossible de déterminer la sécurité
           * de la session.
           */
          persistLock(userId);
          setSessionSecurityState(
            "LOCKED",
          );
          setLocked(true);

          setError(
            "Impossible de vérifier la sécurité de cette session. Rechargez la page ou reconnectez-vous.",
          );
        }
      } finally {
        if (!cancelled) {
          setCheckingPin(false);
        }
      }
    };

    void loadSecurityState();

    return () => {
      cancelled = true;
    };

    /**
     * Cet effet doit suivre uniquement l'identité
     * de la session.
     *
     * sessionSecurityState est volontairement exclu :
     * sa transition LOCKED -> UNLOCKED ne doit jamais
     * relancer cette initialisation.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  /**
   * Synchronise simplement l'overlay avec un
   * verrouillage demandé ailleurs dans l'application.
   *
   * Cette synchronisation n'effectue aucun appel API.
   */
  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    if (
      sessionSecurityState ===
      "LOCKED"
    ) {
      persistLock(currentUser.id);
      setLocked(true);
    }
  }, [
    currentUser?.id,
    sessionSecurityState,
  ]);

  /**
   * Charge la durée d'inactivité configurée.
   */
  useEffect(() => {
    if (!currentUser?.id) return;

    const refresh = () =>
      setMinutes(
        Number(
          localStorage.getItem(
            minutesKey(currentUser.id),
          ) || 0,
        ),
      );

    refresh();

    window.addEventListener(
      "aulia:session-lock-setting",
      refresh,
    );

    return () =>
      window.removeEventListener(
        "aulia:session-lock-setting",
        refresh,
      );
  }, [currentUser?.id]);

  /**
   * Verrouillage automatique après inactivité.
   */
  useEffect(() => {
    if (
      !minutes ||
      locked ||
      checkingPin ||
      !currentUser?.id ||
      !hasPin.current ||
      sessionSecurityState !==
        "UNLOCKED"
    ) {
      return;
    }

    const reset = () => {
      if (timer.current) {
        window.clearTimeout(
          timer.current,
        );
      }

      timer.current =
        window.setTimeout(
          lockNow,
          minutes * 60_000,
        );
    };

    const events = [
      "pointerdown",
      "keydown",
      "touchstart",
      "mousemove",
    ];

    events.forEach((name) =>
      window.addEventListener(
        name,
        reset,
        { passive: true },
      ),
    );

    reset();

    return () => {
      if (timer.current) {
        window.clearTimeout(
          timer.current,
        );
      }

      events.forEach((name) =>
        window.removeEventListener(
          name,
          reset,
        ),
      );
    };
  }, [
    currentUser?.id,
    checkingPin,
    locked,
    minutes,
    sessionSecurityState,
  ]);

  /**
   * Une sortie/recharge de page marque localement
   * la session comme devant être protégée lors
   * de sa prochaine restauration.
   */
  useEffect(() => {
    if (
      !currentUser?.id ||
      !hasPin.current
    ) {
      return;
    }

    const protectOnExit = () =>
      persistLock(currentUser.id);

    window.addEventListener(
      "pagehide",
      protectOnExit,
    );

    return () =>
      window.removeEventListener(
        "pagehide",
        protectOnExit,
      );
  }, [
    currentUser?.id,
    checkingPin,
  ]);

  /**
   * Déverrouillage par PIN.
   */
  const unlock = async () => {
    if (
      !currentUser?.id ||
      checkingPin
    ) {
      return;
    }

    try {
      setError(null);

      await apiFetch(
        "/auth/verify-pin",
        {
          method: "POST",
          body: JSON.stringify({
            pin,
          }),
        },
      );

      /**
       * Le backend vient de confirmer le PIN.
       *
       * À partir de cet instant, UNLOCKED devient
       * l'état autoritaire de la session.
       */
      clearLock(currentUser.id);
      setPin("");
      setLocked(false);
      setSessionSecurityState(
        "UNLOCKED",
      );
    } catch (reason) {
      /**
       * Un PIN refusé ne doit jamais ouvrir
       * l'interface.
       */
      persistLock(currentUser.id);
      setSessionSecurityState(
        "LOCKED",
      );
      setLocked(true);

      setError(
        reason instanceof Error
          ? reason.message
          : "Code PIN incorrect.",
      );

      setPin("");
    }
  };

  if (
    !locked &&
    !checkingPin
  ) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[1000000] grid place-items-center bg-slate-950 bg-cover bg-center p-4"
      style={{
        backgroundImage:
          "linear-gradient(rgba(2, 12, 27, .72), rgba(2, 12, 27, .84)), url('/images/lock_screen.jpg')",
      }}
    >
      <section className="w-full max-w-sm rounded-3xl border border-white/20 bg-slate-950/75 p-6 text-center text-white shadow-2xl backdrop-blur-xl">
        <img
          src="/logo/logo.png"
          alt="Aulia Care"
          className="mx-auto h-16 w-16 object-contain"
          onError={(event) => {
            event.currentTarget.style.display =
              "none";
          }}
        />

        <h1 className="mt-4 text-xl font-bold">
          Session verrouillée
        </h1>

        <p className="mt-2 text-sm text-slate-200">
          {checkingPin
            ? "Vérification de la sécurité de votre session…"
            : `${currentUser?.displayName}, saisissez votre code PIN pour reprendre.`}
        </p>

        {!checkingPin && (
          <>
            <input
              autoFocus
              inputMode="numeric"
              pattern="[0-9]*"
              type="password"
              value={pin}
              maxLength={6}
              onChange={(event) =>
                setPin(
                  event.target.value.replace(
                    /\D/g,
                    "",
                  ),
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter"
                ) {
                  void unlock();
                }
              }}
              className="mt-5 w-full rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-center text-xl tracking-[.55em] outline-none focus:border-aulia-teal"
              placeholder="••••"
            />

            {error && (
              <p className="mt-3 text-sm text-red-200">
                {error}
              </p>
            )}

            <div className="mt-5 grid grid-cols-3 gap-2 sm:hidden">
              {[
                1,
                2,
                3,
                4,
                5,
                6,
                7,
                8,
                9,
                "",
                0,
                "⌫",
              ].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() =>
                    value === "⌫"
                      ? setPin((v) =>
                          v.slice(0, -1),
                        )
                      : value !== "" &&
                        setPin((v) =>
                          `${v}${value}`.slice(
                            0,
                            6,
                          ),
                        )
                  }
                  className="h-12 rounded-xl bg-white/10 text-lg font-semibold active:bg-aulia-teal"
                >
                  {value}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                void unlock()
              }
              className="mt-5 w-full rounded-xl bg-aulia-teal px-4 py-3 font-bold text-white hover:bg-aulia-teal/90"
            >
              Déverrouiller
            </button>
          </>
        )}
      </section>
    </div>
  );
}