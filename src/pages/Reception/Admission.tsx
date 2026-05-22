import React, { useEffect, useMemo, useState } from "react";
import { findPatientByPhone, saveAdmission, uploadFileMock } from "../../api/reception";

const services = [
  "Médecine générale",
  "Cardiologie",
  "Pédiatrie",
  "Radiologie",
  "Laboratoire",
  "Urgences",
  "Chirurgie",
  "Neurologie"
];

const doctorsByService: Record<string, string[]> = {
  "Médecine générale": ["Dr Amani", "Dr Kalombo"],
  Cardiologie: ["Dr Mukendi", "Dr Mupenda"],
  Pédiatrie: ["Dr Okapi"],
  Radiologie: ["Dr Lens"],
  Laboratoire: ["Dr Lab"],
  Urgences: ["Dr Rapid"],
  Chirurgie: ["Dr Scalpel"],
  Neurologie: ["Dr Aubin"],
};

const Admission: React.FC = () => {
  const [form, setForm] = useState<any>({
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
    receptionist: "Recep. Deborah Tel",
    motive: "",
    service: services[0],
    doctor: "",
    priority: "Normal",
    insurance: { company: "", policy: "", coverageType: "", coveragePct: 0, photo: null, pdf: null },
    contacts: [] as any[],
    allergies: [] as string[],
    documents: [] as any[],
  });

  const [existingPatient, setExistingPatient] = useState<any>(null);
  const age = useMemo(() => {
    if (!form.dob) return "";
    const diff = Date.now() - new Date(form.dob).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
  }, [form.dob]);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (form.phone && form.phone.length >= 6) {
        const found = await findPatientByPhone(form.phone);
        setExistingPatient(found || null);
      } else {
        setExistingPatient(null);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [form.phone]);

  useEffect(() => {
    // set default doctor when service changes
    if (!form.doctor) setForm((f: any) => ({ ...f, doctor: doctorsByService[form.service]?.[0] || "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.service]);

  const toggleAllergy = (a: string) => {
    setForm((f: any) => ({ ...f, allergies: f.allergies.includes(a) ? f.allergies.filter((x: string) => x !== a) : [...f.allergies, a] }));
  };

  const addContact = () => {
    setForm((f: any) => ({ ...f, contacts: [...f.contacts, { name: "", relation: "", phone: "", address: "" }] }));
  };

  const updateContact = (i: number, key: string, value: any) => {
    setForm((f: any) => ({ ...f, contacts: f.contacts.map((c: any, idx: number) => (idx === i ? { ...c, [key]: value } : c)) }));
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>, key: string, subkey?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploaded = await uploadFileMock(file);
    if (subkey) {
      setForm((f: any) => ({ ...f, [key]: { ...(f[key] || {}), [subkey]: uploaded } }));
    } else {
      setForm((f: any) => ({ ...f, [key]: [...(f[key] || []), uploaded] }));
    }
  };

  const submit = async () => {
    const saved = await saveAdmission(form);
    alert(`Admission enregistrée (simulation) — id ${saved.id}`);
    // reset basic fields but keep dossierNumber
    setForm((f: any) => ({ ...f, name: "", phone: "", motive: "", documents: [], contacts: [], insurance: { company: "", policy: "", coverageType: "", coveragePct: 0, photo: null, pdf: null } }));
  };

  return (
    <div className="p-4 sm:p-6 bg-gray-50 dark:bg-slate-950 min-h-screen">
      <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Nouvelle admission</h2>
      <div className="grid grid-cols-12 gap-4 sm:gap-6">
        <div className="col-span-12 lg:col-span-8">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700">
            <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">1. Informations personnelles</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              <input placeholder="Nom complet" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="sm:col-span-2 lg:col-span-2 rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="F">Femme</option>
                <option value="M">Homme</option>
                <option value="O">Autre</option>
              </select>
              <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white text-sm">Âge: {age}</div>
              <input placeholder="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="col-span-1 sm:col-span-2 lg:col-span-2 rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Profession" value={form.profession} onChange={(e) => setForm({ ...form, profession: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Nationalité" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
              <input placeholder="Réceptionniste" value={form.receptionist} onChange={(e) => setForm({ ...form, receptionist: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700 mt-4">
            <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">3. Motif de visite</h3>
            <textarea placeholder="Motif principal" value={form.motive} onChange={(e) => setForm({ ...form, motive: e.target.value })} className="w-full rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 h-28 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700 mt-4">
            <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">4. Orientation médicale</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              <select value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} className="sm:col-span-2 lg:col-span-2 rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {services.map((s) => (<option key={s}>{s}</option>))}
              </select>
              <select value={form.doctor} onChange={(e) => setForm({ ...form, doctor: e.target.value })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {(doctorsByService as any)[form.service]?.map((d: string) => (<option key={d}>{d}</option>))}
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700 mt-4">
            <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">5. Niveau priorité</h3>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <button onClick={() => setForm({ ...form, priority: "Normal" })} className={`px-3 py-1 rounded-full text-sm font-medium transition ${form.priority==="Normal"?"bg-green-100 dark:bg-green-900 text-green-900 dark:text-green-100":"border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>🟢 Normal</button>
              <button onClick={() => setForm({ ...form, priority: "Prioritaire" })} className={`px-3 py-1 rounded-full text-sm font-medium transition ${form.priority==="Prioritaire"?"bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100":"border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>🟡 Prioritaire</button>
              <button onClick={() => setForm({ ...form, priority: "Urgence" })} className={`px-3 py-1 rounded-full text-sm font-medium transition ${form.priority==="Urgence"?"bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100":"border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>🔴 Urgence critique</button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700 mt-4">
            <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">6. Assurance médicale</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              <input placeholder="Compagnie assurance" value={form.insurance.company} onChange={(e) => setForm({ ...form, insurance: { ...form.insurance, company: e.target.value } })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Numéro police" value={form.insurance.policy} onChange={(e) => setForm({ ...form, insurance: { ...form.insurance, policy: e.target.value } })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Type couverture" value={form.insurance.coverageType} onChange={(e) => setForm({ ...form, insurance: { ...form.insurance, coverageType: e.target.value } })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="number" placeholder="% couverture" value={form.insurance.coveragePct} onChange={(e) => setForm({ ...form, insurance: { ...form.insurance, coveragePct: Number(e.target.value) } })} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <label className="col-span-1 sm:col-span-2 flex items-center gap-3 cursor-pointer px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300"><input type="file" accept="image/*" onChange={(e)=>handleFile(e,'insurance','photo')} className="hidden" /> Photo carte assurance</label>
              <label className="col-span-1 sm:col-span-2 flex items-center gap-3 cursor-pointer px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300"><input type="file" accept="application/pdf" onChange={(e)=>handleFile(e,'insurance','pdf')} className="hidden" /> PDF contrat</label>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700 mt-4">
            <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">7. Contacts famille / urgence</h3>
            {form.contacts.map((c: any, i: number) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
                <input placeholder="Nom" value={c.name} onChange={(e)=>updateContact(i,'name',e.target.value)} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input placeholder="Relation" value={c.relation} onChange={(e)=>updateContact(i,'relation',e.target.value)} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input placeholder="Téléphone" value={c.phone} onChange={(e)=>updateContact(i,'phone',e.target.value)} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input placeholder="Adresse" value={c.address} onChange={(e)=>updateContact(i,'address',e.target.value)} className="rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ))}
            <button onClick={addContact} className="px-3 py-1 rounded bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white border border-gray-300 dark:border-slate-600 hover:bg-gray-200 dark:hover:bg-slate-700 text-sm font-medium">+ Ajouter contact</button>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700 mt-4">
            <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">8. Allergies & alertes médicales</h3>
            <div className="flex gap-2 flex-wrap">
              {['Allergies','Diabète','Hypertension','Asthme','Épilepsie'].map(a=> (
                <button key={a} onClick={()=>toggleAllergy(a)} className={`px-3 py-1 rounded text-sm font-medium transition ${form.allergies.includes(a)?'bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100 border border-red-300 dark:border-red-700':'border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800'}`}>{a}</button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700 mt-4">
            <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">9. Documents joints</h3>
            <label className="flex items-center gap-3 cursor-pointer px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300"><input type="file" onChange={(e)=>handleFile(e,'documents')} className="hidden" /> Joindre fichier</label>
            <ul className="mt-3 space-y-1">
              {form.documents.map((d:any,i:number)=> (<li key={i}><a href={d.url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">{d.name}</a></li>))}
            </ul>
          </div>
        </div>

        <aside className="col-span-12 lg:col-span-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700">
            <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">Résumé admission</h3>
            <div className="mt-3 text-sm space-y-2">
              <div className="text-gray-700 dark:text-gray-300"><span className="font-medium">Patient:</span> {form.name || '—'}</div>
              <div className="text-gray-700 dark:text-gray-300"><span className="font-medium">Service:</span> {form.service}</div>
              <div className="text-gray-700 dark:text-gray-300"><span className="font-medium">Médecin:</span> {form.doctor}</div>
              <div className="text-gray-700 dark:text-gray-300"><span className="font-medium">Priorité:</span> {form.priority}</div>
              <div className="text-gray-700 dark:text-gray-300"><span className="font-medium">Assurance:</span> {form.insurance.company ? '✅ Validée' : '—'}</div>
            </div>

            <div className="mt-4 space-y-2">
              <button onClick={submit} className="w-full rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-3 py-2 font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition text-sm">✅ Enregistrer admission</button>
              <button onClick={()=>window.print()} className="w-full rounded border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 px-3 py-2 font-medium hover:bg-gray-50 dark:hover:bg-slate-800 transition text-sm">🖨️ Imprimer fiche</button>
              <button onClick={()=>{ setForm({ ...form, name: '', phone: '' }); }} className="w-full rounded border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 px-3 py-2 font-medium hover:bg-gray-50 dark:hover:bg-slate-800 transition text-sm">❌ Annuler</button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700 mt-4">
            <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">Détection auto</h3>
            {existingPatient ? (
              <div className="p-3 border border-gray-300 dark:border-slate-600 rounded bg-blue-50 dark:bg-slate-800">
                <div className="font-medium text-gray-900 dark:text-white">{existingPatient.name}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">{existingPatient.phone}</div>
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <button onClick={()=>alert('Ouvrir dossier (simulation)')} className="px-2 py-1 rounded border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 text-xs font-medium">Ouvrir dossier</button>
                  <button onClick={()=>alert('Nouvelle visite (simulation)')} className="px-2 py-1 rounded border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 text-xs font-medium">Nouvelle visite</button>
                  <button onClick={()=>alert('Hospitalisation (simulation)')} className="px-2 py-1 rounded border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 text-xs font-medium">Hospitalisation</button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400">Tapez un numéro pour détecter un patient existant.</div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow dark:shadow-lg border border-gray-200 dark:border-slate-700 mt-4">
            <h3 className="font-medium mb-3 text-gray-900 dark:text-white text-sm sm:text-base">IA réception</h3>
            <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-slate-800 p-3 rounded border border-gray-200 dark:border-slate-700">
              <div>Carte IA: charge service (demo)</div>
              <div>Cardiologie: 48 min</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Admission;
