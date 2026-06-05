import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { createPatientAdmission, findPatientByEmail, findPatientByPhone, searchPatients, fetchServices, fetchPatientsFromDatabase } from "../../api/reception";

type ModalStep = null | "success";

const relationOptions = [
  "parent",
  "enfant",
  "frère",
  "sœur",
  "ami",
  "conjoint",
  "tante",
  "oncle",
  "grand-mère",
  "grand-père",
  "époux",
  "épouse",
  "collègue",
];

const Admission: React.FC = () => {
  const [form, setForm] = useState<any>({
    category: "P",
    name: "",
    gender: "F",
    dob: "",
    phone: "",
    email: "",
    address: "",
    profession: "",
    nationality: "Congolaise",
    dossierNumber: `D-${Date.now().toString().slice(-6)}`,
    admissionType: "Consultation",
    arrival: new Date().toISOString(),
    receptionist: "",
    serviceId: "",
    doctor: "",
    priority: "Normal",
    insurance: { company: "", policy: "", coverageType: "", coveragePct: 0, photo: null, pdf: null },
    contacts: [] as any[],
    allergies: [] as string[],
    documents: [] as any[],
    amountDue: 0,
    paymentRequestId: "",
  });
  const [existingPatient, setExistingPatient] = useState<any>(null);
  const { currentUser } = useAuth();
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [professionSuggestions, setProfessionSuggestions] = useState<string[]>([]);
  const [phoneMatchPatient, setPhoneMatchPatient] = useState<any>(null);
  const [emailMatchPatient, setEmailMatchPatient] = useState<any>(null);
  const [servicesList, setServicesList] = useState<any[]>([]);
  const [modalStep, setModalStep] = useState<ModalStep>(null);


  const age = useMemo(() => {
    if (!form.dob) return "";
    const diff = Date.now() - new Date(form.dob).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
  }, [form.dob]);

  useEffect(() => {
    // If we have a logged in receptionist, set default receptionist and compute dossier number
    (async () => {
      try {
        if (currentUser) {
          const name = currentUser.firstName ? `${currentUser.firstName} ${currentUser.lastName || ""}`.trim() : currentUser.displayName || currentUser.username || "Réceptionniste";
          setForm((f: any) => ({ ...f, receptionist: name }));

          // compute position as number of patients in db + 1
          try {
            const patients = await fetchPatientsFromDatabase();
            const position = (patients?.length || 0) + 1;
            const year = new Date().getFullYear();
            const firstInitial = (currentUser.firstName || name || "R")[0] || "R";
            const dossier = `D7-${firstInitial}${position}${year}`;
            setForm((f: any) => ({ ...f, dossierNumber: dossier }));
          } catch (e) {
            // fallback: keep existing dossier
          }
        }
      } catch (e) {}
    })();

    const timeout = setTimeout(async () => {
      const nameSearch = form.name.trim();
      if (nameSearch.length >= 2) {
        const founds = await searchPatients(form.name);
        setSuggestions(founds || []);
      } else {
        setSuggestions([]);
      }

      if (form.phone && form.phone.trim().length >= 6) {
        const foundPhone = await findPatientByPhone(form.phone);
        setPhoneMatchPatient(foundPhone || null);
      } else {
        setPhoneMatchPatient(null);
      }

      if (form.email && form.email.trim().length >= 5) {
        const foundEmail = await findPatientByEmail(form.email);
        setEmailMatchPatient(foundEmail || null);
      } else {
        setEmailMatchPatient(null);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [form.name, form.phone, form.email]);

  const PROFESSIONS = [
    'Infirmier', 'Médecin', 'Secrétaire', 'Enseignant', 'Ingénieur', 'Étudiant', 'Commerçant', 'Retraité', 'Artisan', 'Conducteur',
    'Agriculteur', 'Cadre', 'Technicien', 'Pharmacien', 'Laborantin', 'Infirmière', 'Sage-femme', 'Architecte', 'Banquier', 'Avocat'
  ];

  useEffect(() => {
    const q = (form.profession || '').trim();
    if (q.length >= 2) {
      const found = PROFESSIONS.filter((p) => p.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
      setProfessionSuggestions(found);
    } else {
      setProfessionSuggestions([]);
    }
  }, [form.profession]);

  // load services catalog on mount
  useEffect(() => {
    (async () => {
      try {
        const svcs = await fetchServices();
        setServicesList(svcs || []);
        if (svcs && svcs.length > 0 && !form.serviceId) {
          setForm((f: any) => ({ ...f, serviceId: svcs[0].id }));
        }
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    const svc = servicesList.find((s) => s.id === form.serviceId) || servicesList[0];
    const responsables = svc?.responsables?.map((r: any) => r.user?.displayName || r.user?.username).filter(Boolean) || [];
    setForm((f: any) => ({
      ...f,
      doctor: responsables.length > 0 ? responsables[0] : "",
      amountDue: Number(svc?.tarifs?.length ? svc.tarifs[0].prix : 0) || 0,
    }));
  }, [form.serviceId, servicesList]);

  const toggleAllergy = (a: string) => {
    setForm((f: any) => ({ ...f, allergies: f.allergies.includes(a) ? f.allergies.filter((x: string) => x !== a) : [...f.allergies, a] }));
  };

  const addContact = () => {
    setForm((f: any) => ({ ...f, contacts: [...f.contacts, { name: "", relation: "", phone: "", address: "" }] }));
  };

  const updateContact = (i: number, key: string, value: any) => {
    setForm((f: any) => ({ ...f, contacts: f.contacts.map((c: any, idx: number) => (idx === i ? { ...c, [key]: value } : c)) }));
  };

  const resetForm = () => {
    setExistingPatient(null);
    setPhoneMatchPatient(null);
    setEmailMatchPatient(null);
    setModalStep(null);
    setForm({
      category: "P",
      name: "",
      gender: "F",
      dob: "",
      phone: "",
      email: "",
      address: "",
      profession: "",
      nationality: "",
      dossierNumber: `D-${Date.now().toString().slice(-6)}`,
      admissionType: "Consultation",
      arrival: new Date().toISOString().slice(0, 16),
      receptionist: currentUser?.firstName ? `${currentUser.firstName} ${currentUser.lastName || ''}`.trim() : currentUser?.displayName || currentUser?.username || "Réceptionniste",
      serviceId: servicesList[0]?.id || '',
      doctor: servicesList[0]?.responsables?.[0]?.user?.displayName || '',
      priority: "Normal",
      insurance: { company: "", policy: "", coverageType: "", coveragePct: 0, photo: null, pdf: null },
      contacts: [],
      allergies: [],
      documents: [],
    });
  };

  const conflictPatient = existingPatient || phoneMatchPatient || emailMatchPatient;
  const contactMatchPatient = phoneMatchPatient || emailMatchPatient;

  const splitFullName = (value: string) => {
    const parts = value.trim().split(/\s+/).filter(Boolean);
    return {
      firstName: parts[0] || '',
      lastName: parts.length > 1 ? parts.slice(-1).join(' ') : parts[0] || '',
    };
  };

  const handleSaveClick = async () => {
    if (conflictPatient) {
      window.alert(`Un patient existe déjà avec le même nom, téléphone ou email. Vérifiez son dossier avant de créer une admission.`);
      return;
    }

    try {
      const { firstName, lastName } = splitFullName(form.name);
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const token = localStorage.getItem('d7-clinic-access-token') || localStorage.getItem('d7-clinic-api-token');

      // 1. Create patient admission
      const patient = await createPatientAdmission({
        firstName,
        lastName,
        gender: form.gender,
        dateOfBirth: form.dob,
        phone: form.phone,
        email: form.email,
        address: form.address,
        nationality: form.nationality,
        insuranceProvider: form.insurance.company,
        insuranceNumber: form.insurance.policy,
        admissionType: form.admissionType,
        serviceId: form.serviceId,
        priority: form.priority,
        receptionist: form.receptionist,
        arrivalAt: form.arrival,
      } as any);

      // 2. Get patient position and create user account
      try {
        const patientsRes = await fetch(`${API_BASE_URL}/patients`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          credentials: 'include',
        });
        const allPatients = patientsRes.ok ? await patientsRes.json() : [];
        const position = (allPatients?.length || 0);
        const year = new Date().getFullYear();
        const patientPassword = `D7P-${position}${year}`;

        // Create user for patient
        const userRes = await fetch(`${API_BASE_URL}/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            username: form.name || `${firstName} ${lastName}`,
            email: form.email,
            password: patientPassword,
            displayName: form.name || `${firstName} ${lastName}`,
            firstName,
            lastName,
            primaryRole: 'PATIENT',
            phone: form.phone,
          }),
        });

        if (!userRes.ok) {
          console.warn('User creation warning:', await userRes.text());
        }
      } catch (userError) {
        console.warn('Could not create user account:', userError);
      }

      setModalStep('success');
      console.log('Admission enregistrée', patient);
    } catch (error: any) {
      window.alert(error?.message || 'Une erreur est survenue lors de l’enregistrement de l’admission.');
    }
  };

  const renderPatientDetails = () => (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700">
      <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Patient déjà enregistré</h3>
      <div className="grid grid-cols-1 gap-3 text-sm text-gray-700 dark:text-gray-300">
        <div><span className="font-medium">Nom:</span> {existingPatient.firstName ? `${existingPatient.firstName} ${existingPatient.lastName}` : existingPatient.name}</div>
        <div><span className="font-medium">Catégorie:</span> {existingPatient.insuranceProvider ? "Abonné" : "Particulier"}</div>
        <div><span className="font-medium">Entreprise:</span> {existingPatient.insuranceProvider || "—"}</div>
        <div><span className="font-medium">Téléphone:</span> {existingPatient.phone}</div>
        <div><span className="font-medium">Email:</span> {existingPatient.email}</div>
        <div><span className="font-medium">Adresse:</span> {existingPatient.address}</div>
        <div><span className="font-medium">Service:</span> {existingPatient.service || '—'}</div>
        <div><span className="font-medium">Médecin:</span> {existingPatient.doctor || '—'}</div>
        <div><span className="font-medium">Priorité:</span> {existingPatient.priority || '—'}</div>
        <div><span className="font-medium">Allergies:</span> {(existingPatient.allergies || []).join(", ") || "Aucune"}</div>
      </div>
      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <button onClick={resetForm} className="w-full sm:w-auto rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-3 py-2 text-sm font-medium">Nouvelle admission</button>
        <button onClick={() => alert("Ouvrir dossier (simulation)")} className="w-full sm:w-auto rounded border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 px-3 py-2 text-sm font-medium">Ouvrir dossier</button>
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 bg-gray-50 dark:bg-slate-950 min-h-screen">
      <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Nouvelle admission</h2>
      <div className="grid grid-cols-12 gap-4 sm:gap-6">
        <div className="col-span-12 lg:col-span-8">
          {existingPatient ? (
            renderPatientDetails()
          ) : (
            <>
              <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700">
                <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">1. Informations personnelles</h3>
                {contactMatchPatient && !existingPatient ? (
                  <div className="mb-3 rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/40 p-3 text-sm text-red-800 dark:text-red-100">
                    Ce contact correspond déjà à un patient existant : <strong>{contactMatchPatient.name}</strong>. Vous pouvez confirmer la relation avant de continuer.
                  </div>
                ) : null}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="S">Abonné</option>
                    <option value="P">Particulier</option>
                  </select>
                  <input placeholder="Nom complet" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="sm:col-span-2 lg:col-span-2 rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {suggestions.length > 0 && (
                    <div className="absolute bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded mt-1 max-h-48 overflow-auto z-50 w-full">
                      {suggestions.slice(0, 8).map((s) => (
                        <div key={s.id} onClick={() => { setExistingPatient(s); setForm((f:any) => ({ ...f, name: `${s.firstName} ${s.lastName}`, phone: s.phone || f.phone, email: s.email || f.email })); setSuggestions([]); }} className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer text-sm">
                          <div className="font-medium text-gray-900 dark:text-white">{s.firstName} {s.lastName}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{s.phone || s.email || ''}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="F">Femme</option>
                    <option value="M">Homme</option>
                    <option value="O">Autre</option>
                  </select>
                  <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <div className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white text-sm">Âge: {age}</div>
                  <div className="space-y-1">
                    <input placeholder="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    {phoneMatchPatient && !existingPatient ? (
                      <p className="text-xs text-red-600 dark:text-red-400">Ce téléphone correspond déjà à : {phoneMatchPatient.name}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    {emailMatchPatient && !existingPatient ? (
                      <p className="text-xs text-red-600 dark:text-red-400">Cet email correspond déjà à : {emailMatchPatient.name}</p>
                    ) : null}
                  </div>
                  <input placeholder="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="col-span-1 sm:col-span-2 lg:col-span-2 rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <div className="relative">
                    <input placeholder="Profession" value={form.profession} onChange={(e) => setForm({ ...form, profession: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full" />
                    {professionSuggestions.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded mt-1 max-h-40 overflow-auto">
                        {professionSuggestions.map((p) => (
                          <div key={p} onClick={() => setForm((f:any) => ({ ...f, profession: p }))} className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer text-sm">
                            {p}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <input placeholder="Nationalité" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {form.category === "S" ? (
                    <>
                      <input placeholder="Entreprise / Société" value={form.insurance.company} onChange={(e) => setForm({ ...form, insurance: { ...form.insurance, company: e.target.value } })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input placeholder="N° police" value={form.insurance.policy} onChange={(e) => setForm({ ...form, insurance: { ...form.insurance, policy: e.target.value } })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </>
                  ) : (
                    <div className="sm:col-span-2 lg:col-span-2 rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white text-sm">Particulier : aucune entreprise exigée.</div>
                  )}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700 mt-4">
                <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">2. Informations administratives</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                  <div className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white text-sm">N° dossier: {form.dossierNumber}</div>
                  <select value={form.admissionType} onChange={(e) => setForm({ ...form, admissionType: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option>Consultation</option>
                    <option>Urgence</option>
                    <option>Hospitalisation</option>
                    <option>Contrôle</option>
                  </select>
                  <input type="datetime-local" value={form.arrival} onChange={(e) => setForm({ ...form, arrival: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input placeholder="Réceptionniste" value={form.receptionist} readOnly className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700 mt-4">
                <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">4. Orientation médicale</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                  <select value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })} className="sm:col-span-2 lg:col-span-2 rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {servicesList.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                  </select>
                  <select value={form.doctor} onChange={(e) => setForm({ ...form, doctor: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {(servicesList.find((s) => s.id === form.serviceId)?.responsables || []).map((r: any) => (<option key={r.id} value={r.user?.displayName || r.user?.username}>{r.user?.displayName || r.user?.username}</option>))}
                  </select>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700 mt-4">
                <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">5. Niveau priorité</h3>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <button onClick={() => setForm({ ...form, priority: "Normal" })} className={`px-3 py-1 rounded-full text-sm font-medium transition ${form.priority === "Normal" ? "bg-green-100 dark:bg-green-900 text-green-900 dark:text-green-100" : "border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>🟢 Normal</button>
                  <button onClick={() => setForm({ ...form, priority: "Prioritaire" })} className={`px-3 py-1 rounded-full text-sm font-medium transition ${form.priority === "Prioritaire" ? "bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100" : "border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>🟡 Prioritaire</button>
                  <button onClick={() => setForm({ ...form, priority: "Urgence" })} className={`px-3 py-1 rounded-full text-sm font-medium transition ${form.priority === "Urgence" ? "bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100" : "border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>🔴 Urgence critique</button>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700 mt-4">
                <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">7. Contacts famille / urgence</h3>
                {form.contacts.map((c: any, i: number) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
                    <input placeholder="Nom" value={c.name} onChange={(e) => updateContact(i, "name", e.target.value)} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <select value={c.relation} onChange={(e) => updateContact(i, "relation", e.target.value)} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Sélectionner relation</option>
                      {relationOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                    </select>
                    <input placeholder="Téléphone" value={c.phone} onChange={(e) => updateContact(i, "phone", e.target.value)} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input placeholder="Adresse" value={c.address} onChange={(e) => updateContact(i, "address", e.target.value)} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
                <button onClick={addContact} className="px-3 py-1 rounded bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white border border-gray-300 dark:border-slate-600 hover:bg-gray-200 dark:hover:bg-slate-700 text-sm font-medium">+ Ajouter contact</button>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700 mt-4">
                <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">8. Allergies & alertes médicales</h3>
                <div className="flex gap-2 flex-wrap">
                  {['Allergies', 'Diabète', 'Hypertension', 'Asthme', 'Épilepsie'].map((a) => (
                    <button key={a} onClick={() => toggleAllergy(a)} className={`px-3 py-1 rounded text-sm font-medium transition ${form.allergies.includes(a) ? 'bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100 border border-red-300 dark:border-red-700' : 'border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800'}`}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <aside className="col-span-12 lg:col-span-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700">
            <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">Résumé admission</h3>
            <div className="mt-3 text-sm space-y-2">
              <div className="text-gray-700 dark:text-gray-300"><span className="font-medium">Patient:</span> {form.name || (existingPatient ? existingPatient.name : '—')}</div>
              <div className="text-gray-700 dark:text-gray-300"><span className="font-medium">Service:</span> {existingPatient ? (existingPatient.service || (existingPatient.serviceId ? servicesList.find((s)=>s.id===existingPatient.serviceId)?.name : '—')) : (servicesList.find((s)=>s.id===form.serviceId)?.name || '—')}</div>
              <div className="text-gray-700 dark:text-gray-300"><span className="font-medium">Médecin:</span> {existingPatient ? existingPatient.doctor : form.doctor}</div>
              <div className="text-gray-700 dark:text-gray-300"><span className="font-medium">Priorité:</span> {existingPatient ? existingPatient.priority : form.priority}</div>
              <div className="text-gray-700 dark:text-gray-300"><span className="font-medium">Assurance:</span> {existingPatient ? (existingPatient.insurance?.company ? '✅ Validée' : '—') : (form.insurance.company ? '✅ Validée' : '—')}</div>
            </div>

            <div className="mt-4 space-y-2">
              <button
                onClick={handleSaveClick}
                disabled={!!existingPatient}
                className={`w-full rounded px-3 py-2 font-medium text-sm transition ${existingPatient ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"}`}
              >
                Enregistrer & Envoyez
              </button>
              <button onClick={() => window.print()} className="w-full rounded border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 px-3 py-2 font-medium hover:bg-gray-50 dark:hover:bg-slate-800 transition text-sm">Imprimer fiche</button>
              <button onClick={resetForm} className="w-full rounded border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 px-3 py-2 font-medium hover:bg-gray-50 dark:hover:bg-slate-800 transition text-sm">Annuler</button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700 mt-4">
            <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">Détection auto</h3>
            {existingPatient ? (
              <div className="p-3 border border-gray-300 dark:border-slate-600 rounded bg-blue-50 dark:bg-slate-800">
                <div className="font-medium text-gray-900 dark:text-white">{existingPatient.name}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">{existingPatient.phone}</div>
                <div className="mt-3 text-sm text-gray-700 dark:text-gray-300">Patient trouvé. Tous les champs sont remplacés par ses détails.</div>
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <button onClick={resetForm} className="px-2 py-1 rounded border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 text-xs font-medium">Nouvelle admission</button>
                  <button onClick={() => alert("Nouvelle visite (simulation)")} className="px-2 py-1 rounded border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 text-xs font-medium">Nouvelle visite</button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400">Tapez le nom complet (casse non sensible) ou le téléphone pour détecter un patient existant.</div>
            )}
          </div>
        </aside>
      </div>

      {modalStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-gray-200 dark:border-slate-700">
            {modalStep === "success" && (
              <>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Admission enregistrée</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">La fiche de {form.name || 'ce patient'} a été enregistrée. Une notification de paiement a été envoyée au caissier.</p>
                <div className="mt-4 flex gap-3">
                  <button onClick={() => { setModalStep(null); resetForm(); }} className="rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-sm">Fermer</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Admission;
