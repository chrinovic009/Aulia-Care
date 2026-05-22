export type PatientSummary = {
  id: string;
  name: string;
  phone?: string;
  dob?: string;
};

const SAMPLE_PATIENTS: PatientSummary[] = [
  { id: "p-001", name: "Sarah Ilunga", phone: "+243812345678", dob: "1990-05-12" },
  { id: "p-002", name: "Jean Kabila", phone: "+243820112233", dob: "1982-11-02" },
];

export const findPatientByPhone = async (phone: string) => {
  const normalized = phone.replace(/[^0-9+]/g, "");
  return SAMPLE_PATIENTS.find((p) => p.phone && p.phone.includes(normalized));
};

export const saveAdmission = async (admission: any) => {
  // Simulate saving — in a real app POST to backend
  const saved = { ...admission, id: `adm-${Date.now()}` };
  const key = "mock_admissions";
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    arr.unshift(saved);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (e) {
    // ignore
  }
  return saved;
};

export const uploadFileMock = async (file: File) => {
  // Return an object URL to simulate server-stored file
  return { name: file.name, url: URL.createObjectURL(file), size: file.size };
};
