import { useState } from "react";
import Avatar from "../ui/avatar/Avatar";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../config/api";
import { setSessionLockMinutes } from "../auth/SessionLock";

export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [nextPin, setNextPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [lockMinutes, setLockMinutes] = useState("15");
  const [securityError, setSecurityError] = useState<string | null>(null);
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/signin", { replace: true });
  }

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  function closeDropdown() {
    setIsOpen(false);
  }
  async function saveSecurity() {
    if (!currentUser?.id) return;
    if (!/^\d{4,6}$/.test(nextPin) || nextPin !== confirmation) { setSecurityError("Le nouveau PIN doit contenir 4 à 6 chiffres identiques dans les deux champs."); return; }
    try {
      setSecurityError(null);
      await apiFetch("/auth/change-pin", { method: "POST", body: JSON.stringify({ currentPin, nextPin }) });
      setSessionLockMinutes(currentUser.id, Number(lockMinutes));
      setCurrentPin(""); setNextPin(""); setConfirmation(""); setSecurityOpen(false);
    } catch (reason) { setSecurityError(reason instanceof Error ? reason.message : "La modification du PIN a échoué."); }
  }
  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="flex items-center text-gray-700 dropdown-toggle dark:text-gray-400"
      >
        <div className="mr-3">
          <Avatar
            src={currentUser?.profilePhotoUrl}
            alt={currentUser?.displayName ?? "Utilisateur"}
            initials={
              currentUser
                ? `${currentUser.firstName?.[0] ?? "U"}${currentUser.lastName?.[0] ?? ""}`
                : "U"
            }
            size="large"
          />
        </div>

        <span className="block mr-1 font-medium text-theme-sm">{currentUser?.displayName ?? "Utilisateur"}</span>
        <svg
          className={`stroke-gray-500 dark:stroke-gray-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          width="18"
          height="20"
          viewBox="0 0 18 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.3125 8.65625L9 13.3437L13.6875 8.65625"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute right-0 mt-[17px] flex w-[260px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
      >
        <div>
          <span className="block font-medium text-gray-700 text-theme-sm dark:text-gray-400">
            {currentUser?.displayName ?? "Utilisateur"}
          </span>
          <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">
            {currentUser?.email ?? "email@example.com"}
          </span>
        </div>

        <button
          onClick={() => { closeDropdown(); setSecurityOpen(true); }}
          className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
        >
          Sécurité et code PIN
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 mt-3 w-full text-left font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
        >
          <svg
            className="fill-gray-500 group-hover:fill-gray-700 dark:group-hover:fill-gray-300"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M15.1007 19.247C14.6865 19.247 14.3507 18.9112 14.3507 18.497L14.3507 14.245H12.8507V18.497C12.8507 19.7396 13.8581 20.747 15.1007 20.747H18.5007C19.7434 20.747 20.7507 19.7396 20.7507 18.497L20.7507 5.49609C20.7507 4.25345 19.7433 3.24609 18.5007 3.24609H15.1007C13.8581 3.24609 12.8507 4.25345 12.8507 5.49609V9.74501L14.3507 9.74501V5.49609C14.3507 5.08188 14.6865 4.74609 15.1007 4.74609L18.5007 4.74609C18.9149 4.74609 19.2507 5.08188 19.2507 5.49609L19.2507 18.497C19.2507 18.9112 18.9149 19.247 18.5007 19.247H15.1007ZM3.25073 11.9984C3.25073 12.2144 3.34204 12.4091 3.48817 12.546L8.09483 17.1556C8.38763 17.4485 8.86251 17.4487 9.15549 17.1559C9.44848 16.8631 9.44863 16.3882 9.15583 16.0952L5.81116 12.7484L16.0007 12.7484C16.4149 12.7484 16.7507 12.4127 16.7507 11.9984C16.7507 11.5842 16.4149 11.2484 16.0007 11.2484L5.81528 11.2484L9.15585 7.90554C9.44864 7.61255 9.44847 7.13767 9.15547 6.84488C8.86248 6.55209 8.3876 6.55226 8.09481 6.84525L3.52309 11.4202C3.35673 11.5577 3.25073 11.7657 3.25073 11.9984Z"
              fill=""
            />
          </svg>
          Se déconnecter
        </button>
      </Dropdown>
      {securityOpen && (
        <div className="fixed inset-0 z-[100000] grid place-items-center overflow-y-auto bg-slate-950/60 p-4">
          <section role="dialog" aria-modal="true" className="my-auto w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-950">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-aulia-teal">Sécurité personnelle</p>
            <h2 className="mt-2 text-xl font-bold text-aulia-navy dark:text-white">Modifier votre code PIN</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Saisissez votre mot de passe initial ou votre PIN actuel, puis choisissez un nouveau code de 4 à 6 chiffres.</p>
            <div className="mt-5 space-y-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Mot de passe initial ou PIN actuel
                <input autoComplete="current-password" type="password" value={currentPin} onChange={(event) => setCurrentPin(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              </label>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Nouveau PIN
                <input inputMode="numeric" autoComplete="new-password" type="password" maxLength={6} value={nextPin} onChange={(event) => setNextPin(event.target.value.replace(/\D/g, ""))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              </label>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Confirmer le PIN
                <input inputMode="numeric" autoComplete="new-password" type="password" maxLength={6} value={confirmation} onChange={(event) => setConfirmation(event.target.value.replace(/\D/g, ""))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              </label>
            </div>
            <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200">Verrouillage automatique<select value={lockMinutes} onChange={(event) => setLockMinutes(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 dark:text-white">{[[5,"5 minutes"],[10,"10 minutes"],[15,"15 minutes"],[20,"20 minutes"],[30,"30 minutes"],[60,"1 heure"],[300,"5 heures"],[480,"8 heures"]].map(([value,label]) => <option key={String(value)} value={String(value)}>{String(label)}</option>)}</select></label>
            {securityError && <p className="mt-3 text-sm text-red-600 dark:text-red-300">{securityError}</p>}
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setSecurityOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold dark:border-slate-700 dark:text-white">Annuler</button><button type="button" onClick={() => void saveSecurity()} className="rounded-xl bg-aulia-teal px-4 py-2 font-semibold text-white">Enregistrer</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
