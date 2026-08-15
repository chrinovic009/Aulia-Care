/** API contracts used by the laboratory activity workspace. Kept outside the screen to make clinical UI changes safer. */
export type LabRequestResultParameter = {
  labTestParameterId?: string | null;
  valueNumeric?: number | null;
  valueText?: string | null;
  unit?: string | null;
  referenceRange?: string | null;
  method?: string | null;
  interpretation?: string | null;
  reportedAt?: string | null;
  labTestParameter?: { name?: string | null; unit?: string | null; referenceRange?: string | null } | null;
};

export type LabRequestResult = {
  resultStatus?: string | null;
  resultName?: string | null;
  resultValue?: string | null;
  interpretation?: string | null;
  units?: string | null;
  referenceRange?: string | null;
  comments?: string | null;
  reportedAt?: string | null;
  parameters?: LabRequestResultParameter[];
};

export type LabRequestDetailItem = {
  id?: string;
  status?: string | null;
  requestedAt?: string | null;
  assignedToId?: string | null;
  labTest?: {
    name?: string | null;
    section?: { name?: string | null } | null;
    category?: { name?: string | null } | null;
    referenceRange?: string | null;
    unit?: string | null;
    parameterTemplates?: Array<{ id: string; name?: string | null; unit?: string | null; referenceRange?: string | null }>;
    sampleRequirements?: Array<{ id: string; labSampleType?: { name?: string | null } | null; volumeRequired?: string | number | null; volumeUnit?: string | null; storageCondition?: string | null; maxAgeMinutes?: string | number | null; instructions?: string | null }>;
    consumableRequirements?: Array<{ id: string; labConsumable?: { name?: string | null; unit?: string | null } | null; quantity?: string | number | null; unit?: string | null }>;
  } | null;
  results?: LabRequestResult[];
  samples?: Array<{ id: string; status?: string | null; labSampleType?: { name?: string | null } | null }>;
};

export type LabRequestDetail = {
  id?: string;
  status?: string | null;
  items?: LabRequestDetailItem[];
  results?: LabRequestResult[];
  patient?: { id?: string; firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string | null; address?: string | null; gender?: string | null } | null;
  consultation?: { provider?: { firstName?: string | null; lastName?: string | null; displayName?: string | null; phone?: string | null } | null } | null;
  requestedBy?: { phone?: string | null } | null;
};
