import { useModal } from "../../hooks/useModal";
import { useState, useEffect } from "react";
import { Modal } from "../ui/modal";
import Avatar from "../ui/avatar/Avatar";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Label from "../form/Label";
import { useAuth } from "../../context/AuthContext";

function getRoleLabel(role: string, gender?: string, specialty?: string) {
  switch (role) {
    case "RECEPTIONIST":
      return "Réceptionniste";
    case "NURSE":
      if (gender === "F") return "Infirmière";
      if (gender === "M") return "Infirmier";
      return "Infirmier/ère";
    case "PHYSICIAN":
      return specialty ? `Médecin · ${specialty}` : "Médecin";
    default:
      return role;
  }
}

export default function UserMetaCard() {
  const { isOpen, openModal, closeModal } = useModal();
  const { currentUser, updateProfile } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [facebook, setFacebook] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [instagram, setInstagram] = useState("");

  useEffect(() => {
    if (!currentUser) return;

    setFirstName(currentUser.firstName || "");
    setLastName(currentUser.lastName || "");
    setEmail(currentUser.email || "");
    setPhone(currentUser.phone || "");
    setBio(currentUser.bio || "");
    setFacebook(currentUser.facebookUrl || "");
    setWhatsapp(currentUser.whatsappUrl || "");
    setLinkedin(currentUser.linkedinUrl || "");
    setInstagram(currentUser.instagramUrl || "");
  }, [currentUser]);

  const handleSave = () => {
    if (!currentUser) return;

    updateProfile({
      firstName,
      lastName,
      email,
      phone,
      bio,
      facebookUrl: facebook,
      whatsappUrl: whatsapp,
      linkedinUrl: linkedin,
      instagramUrl: instagram,
    });

    try {
      localStorage.setItem("patientName", `${firstName} ${lastName}`);
    } catch {
      // ignore
    }

    closeModal();
  };

  if (!currentUser) {
    return null;
  }

  return (
    <>
      <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col items-center w-full gap-6 xl:flex-row">
            <Avatar
              src={currentUser.profilePhotoUrl}
              alt={`${currentUser.firstName} ${currentUser.lastName}`}
              initials={`${currentUser.firstName?.[0] ?? "U"}${currentUser.lastName?.[0] ?? ""}`}
              size="large"
            />
            <div className="order-3 xl:order-2">
              <h4 className="mb-2 text-lg font-semibold text-center text-gray-800 dark:text-white/90 xl:text-left">
                {`${currentUser.firstName} ${currentUser.lastName}`}
              </h4>
              <div className="flex flex-col items-center gap-1 text-center xl:flex-row xl:gap-3 xl:text-left">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {getRoleLabel(currentUser.primaryRole, currentUser.gender, currentUser.specialty)}
                </p>
                <div className="hidden h-3.5 w-px bg-gray-300 dark:bg-gray-700 xl:block"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {currentUser.addressCity}, {currentUser.addressProvince}
                </p>
              </div>
            </div>
            <div className="flex items-center order-2 gap-2 grow xl:order-3 xl:justify-end">
              <a
                href={facebook || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 w-11 items-center justify-center gap-2 rounded-full border border-gray-300 bg-white text-sm font-medium text-blue-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
              >
                <svg
                  className="fill-current"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M11.6666 11.2503H13.7499L14.5833 7.91699H11.6666V6.25033C11.6666 5.39251 11.6666 4.58366 13.3333 4.58366H14.5833V1.78374C14.3118 1.7477 13.2858 1.66699 12.2023 1.66699C9.94025 1.66699 8.33325 3.04771 8.33325 5.58342V7.91699H5.83325V11.2503H8.33325V18.3337H11.6666V11.2503Z"
                    fill=""
                  />
                </svg>
              </a>

              <a
                href={whatsapp || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 w-11 items-center justify-center gap-2 rounded-full border border-gray-300 bg-white text-sm font-medium text-green-600 shadow-theme-xs hover:bg-green-50 hover:text-green-700 dark:border-gray-700 dark:bg-gray-800 dark:text-green-400 dark:hover:bg-white/[0.03] dark:hover:text-green-300"
              >
                <svg
                  className="fill-current"
                  width="20"
                  height="20"
                  viewBox="0 0 32 32"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M16.001 3C8.821 3 3 8.821 3 16c0 2.821.922 5.431 2.479 7.553L3 29l5.64-2.396A12.94 12.94 0 0016.001 29C23.18 29 29 23.179 29 16S23.18 3 16.001 3zm0 23.667a10.57 10.57 0 01-5.387-1.48l-.387-.227-3.347 1.422.713-3.26-.253-.4A10.6 10.6 0 015.333 16c0-5.882 4.785-10.667 10.668-10.667 5.881 0 10.666 4.785 10.666 10.667 0 5.881-4.785 10.667-10.666 10.667zm5.853-7.98c-.32-.16-1.893-.934-2.187-1.04-.293-.107-.507-.16-.72.16-.214.32-.827 1.04-1.014 1.254-.187.214-.373.24-.693.08-.32-.16-1.347-.497-2.566-1.587-.948-.846-1.587-1.893-1.774-2.213-.186-.32-.02-.493.14-.653.146-.145.32-.373.48-.56.16-.187.213-.32.32-.533.106-.214.053-.4-.027-.56-.08-.16-.72-1.733-.987-2.373-.26-.627-.527-.54-.72-.547l-.613-.01c-.213 0-.56.08-.853.4-.293.32-1.12 1.093-1.12 2.666 0 1.573 1.147 3.093 1.307 3.307.16.214 2.26 3.453 5.48 4.84.766.33 1.364.527 1.83.674.768.244 1.467.21 2.02.127.616-.092 1.893-.773 2.16-1.52.267-.746.267-1.386.187-1.52-.08-.133-.293-.213-.613-.373z"/>
                </svg>
              </a>

              <a
                href={instagram || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 w-11 items-center justify-center gap-2 rounded-full border border-gray-300 bg-white text-sm font-medium text-red-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
              >
                <svg
                  className="fill-current"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M12.16 2.001H7.84C4.54 2.001 2 4.54 2 7.84v4.32c0 3.3 2.54 5.84 5.84 5.84h4.32c3.3 0 5.84-2.54 5.84-5.84V7.84c0-3.3-2.54-5.839-5.84-5.839zm2.14 2.679a1.048 1.048 0 011.048 1.048 1.048 1.048 0 01-1.048 1.048 1.048 1.048 0 01-1.048-1.048 1.048 1.048 0 011.048-1.048zm-1.12 1.443a3.64 3.64 0 013.64 3.64 3.64 3.64 0 01-3.64 3.64 3.64 3.64 0 01-3.64-3.64 3.64 3.64 0 013.64-3.64zm0 1.237a2.4 2.4 0 100 4.8 2.4 2.4 0 000-4.8z"/>
                </svg>
              </a>
            </div>
          </div>

          <button
            onClick={openModal}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200 lg:inline-flex lg:w-auto"
          >
            <svg
              className="fill-current"
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M15.0911 2.78206C14.2125 1.90338 12.7878 1.90338 11.9092 2.78206L4.57524 10.116C4.26682 10.4244 4.0547 10.8158 3.96468 11.2426L3.31231 14.3352C3.25997 14.5833 3.33653 14.841 3.51583 15.0203C3.69512 15.1996 3.95286 15.2761 4.20096 15.2238L7.29355 14.5714C7.72031 14.4814 8.11172 14.2693 8.42013 13.9609L15.7541 6.62695C16.6327 5.74827 16.6327 4.32365 15.7541 3.44497L15.0911 2.78206ZM12.9698 3.84272C13.2627 3.54982 13.7376 3.54982 14.0305 3.84272L14.6934 4.50563C14.9863 4.79852 14.9863 5.2734 14.6934 5.56629L14.044 6.21573L12.3204 4.49215L12.9698 3.84272ZM11.2597 5.55281L5.6359 11.1766C5.53309 11.2794 5.46238 11.4099 5.43238 11.5522L5.01758 13.5185L6.98394 13.1037C7.1262 13.0737 7.25666 13.003 7.35947 12.9002L12.9833 7.27639L11.2597 5.55281Z"
                fill=""
              />
            </svg>
            Modifier
          </button>
        </div>
      </div>
      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[700px] m-4">
        <div className="relative w-full p-4 overflow-y-auto bg-white no-scrollbar rounded-3xl dark:bg-gray-900 lg:p-11">
          <div className="px-2 pr-14">
            <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              Modifier vos informations de profil
            </h4>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 lg:mb-7">
              Mettez à jour votre affichage, vos contacts et votre bio ici.
            </p>
          </div>
          <form className="flex flex-col">
            <div className="px-2 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                <div>
                  <Label>Facebook</Label>
                  <Input type="text" value={facebook} onChange={(e) => setFacebook(e.target.value)} />
                </div>
                <div>
                  <Label>Whatsapp</Label>
                  <Input type="text" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
                </div>
                <div>
                  <Label>LinkedIn</Label>
                  <Input type="text" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
                </div>
                <div>
                  <Label>Instagram</Label>
                  <Input type="text" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
                </div>
              </div>
              <div className="mt-7">
                <h5 className="mb-5 text-lg font-medium text-gray-800 dark:text-white/90 lg:mb-6">
                  Identité
                </h5>
                <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                  <div className="col-span-2 lg:col-span-1">
                    <Label>Prénom</Label>
                    <Input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </div>
                  <div className="col-span-2 lg:col-span-1">
                    <Label>Nom</Label>
                    <Input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                  <div className="col-span-2 lg:col-span-1">
                    <Label>Courriel</Label>
                    <Input type="text" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="col-span-2 lg:col-span-1">
                    <Label>Téléphone</Label>
                    <Input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <Label>Bio</Label>
                    <Input type="text" value={bio} onChange={(e) => setBio(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 px-2 mt-6 lg:justify-end">
              <Button size="sm" variant="outline" onClick={closeModal}>
                Fermer
              </Button>
              <Button size="sm" onClick={handleSave}>
                Enregistrer les modifications
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}

