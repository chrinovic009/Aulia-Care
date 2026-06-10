import { useMemo, useState, type FormEvent } from "react";
import ComponentCard from "../../common/ComponentCard";
import Label from "../Label";
import Input from "../input/InputField";
import { UserIcon } from "../../../icons";


const treatmentOptions = [
  { id: "consultation", label: "Consultation médicale", price: 25000 },
  { id: "laboratoire", label: "Analyse de laboratoire", price: 18000 },
  { id: "radiologie", label: "Radiologie", price: 40000 },
  { id: "hospitalisation", label: "Hospitalisation", price: 120000 },
  { id: "soins-speciaux", label: "Soins spéciaux", price: undefined, special: true },
];

const paymentNetworks = [
  { code: "Orange", label: "Orange" },
  { code: "Airtel", label: "Airtel" },
  { code: "Vodacom", label: "Vodacom" },
];

const networkPrefixes: Record<string, string[]> = {
  Orange: ["084", "085", "089"],
  Airtel: ["097", "098", "099"],
  Vodacom: ["082", "083", "081"],
};

const normalizePhoneNumber = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("243")) {
    return `0${digits.slice(3)}`;
  }
  return digits;
};

const validatePhoneForNetwork = (number: string, network: string) => {
  const normalized = normalizePhoneNumber(number);
  const prefixes = networkPrefixes[network] ?? [];
  return prefixes.some((prefix) => normalized.startsWith(prefix));
};

export default function InputGroup() {
  const [email, setEmail] = useState("");
  const [network, setNetwork] = useState(paymentNetworks[0].code);
  const [phone, setPhone] = useState("");
  const [selectedTreatment, setSelectedTreatment] = useState(treatmentOptions[0].id);
  const [specialAmount, setSpecialAmount] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [formMessage, setFormMessage] = useState("");

  const treatment = useMemo(
    () => treatmentOptions.find((item) => item.id === selectedTreatment),
    [selectedTreatment],
  );

  const isSpecialTreatment = treatment?.special ?? false;
  const amountLabel = treatment?.price
    ? `${treatment.price.toLocaleString()} CDF`
    : "Montant variable - saisissez le montant dû";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage("");

    if (!phone.trim()) {
      setPhoneError("Entrez un numéro de téléphone valide.");
      return;
    }

    if (!validatePhoneForNetwork(phone, network)) {
      setPhoneError(`Le numéro doit correspondre au réseau ${network}.`);
      return;
    }

    if (isSpecialTreatment && !specialAmount.trim()) {
      setFormMessage("Saisissez le montant dû pour les soins spéciaux.");
      return;
    }

    setPhoneError("");
    setFormMessage(
      `Facture prête : ${treatment?.label} - ${
        isSpecialTreatment ? `${parseFloat(specialAmount).toLocaleString()} CDF` : amountLabel
      } via ${network}.`,
    );
  };

  return (
    <ComponentCard title="Paiement facture sanitaire">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Label>ID patient</Label>
          <div className="relative">
            <Input
              type="text"
              placeholder="ID du patient"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-[62px]"
            />
            <span className="absolute left-0 top-1/2 -translate-y-1/2 border-r border-gray-200 px-3.5 py-3 text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <UserIcon className="size-6" />
            </span>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div>
            <Label>Réseau de paiement</Label>
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800"
            >
              {paymentNetworks.map((networkOption) => (
                <option key={networkOption.code} value={networkOption.code}>
                  {networkOption.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Numéro mobile</Label>
            <Input
              type="tel"
              placeholder="081 234 5678"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (phoneError) {
                  setPhoneError("");
                }
              }}
              error={Boolean(phoneError)}
              hint={phoneError || `Le numéro doit commencer par le préfixe du réseau ${network}.`}
            />
          </div>
        </div>

        <div>
          <Label>Traitement ou service reçu</Label>
          <select
            value={selectedTreatment}
            onChange={(e) => setSelectedTreatment(e.target.value)}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800"
          >
            {treatmentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
          <p className="font-medium">Montant calculé</p>
          <p className="mt-1">{amountLabel}</p>
        </div>

        {isSpecialTreatment && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
              Vous avez choisi un soin spécial. Saisissez le montant dû à l'hôpital avant de valider.
            </p>
            <Label>Montant dû à l'hôpital</Label>
            <Input
              type="number"
              placeholder="Montant en CDF"
              value={specialAmount}
              onChange={(e) => setSpecialAmount(e.target.value)}
              className="mt-2"
            />
          </div>
        )}

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
        >
          Valider le paiement
        </button>

        {formMessage && (
          <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
            {formMessage}
          </p>
        )}
      </form>
    </ComponentCard>
  );
}
