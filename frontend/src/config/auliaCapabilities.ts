export type AuliaLayer = 'CORE' | 'CONNECTED' | 'DIAGNOSTIC';

export type AuliaCapability = {
  id: string;
  requiredLayer: AuliaLayer;
  label: string;
  description: string;
};

export const AULIA_LAYER_LABEL: Record<AuliaLayer, string> = {
  CORE: 'Aulia Care Core',
  CONNECTED: 'Aulia Care Connected Care',
  DIAGNOSTIC: 'Aulia Care Diagnostic Agent',
};

/** Product ownership, separate from a route, a role and a tenant. */
export const AULIA_CAPABILITIES = {
  patientRecord: {
    id: 'patient-record',
    requiredLayer: 'CORE',
    label: 'Dossier patient',
    description: 'Gestion hospitalière et dossier médical classiques.',
  },
  teleconsultation: {
    id: 'teleconsultation',
    requiredLayer: 'CONNECTED',
    label: 'Téléconsultation',
    description: 'Continuité des soins et consultation à distance.',
  },
  wearableMonitoring: {
    id: 'wearable-monitoring',
    requiredLayer: 'CONNECTED',
    label: 'Montres et dispositifs connectés',
    description: 'Collecte et suivi de données hors établissement.',
  },
  dailyConnectedCheckin: {
    id: 'daily-connected-checkin',
    requiredLayer: 'CONNECTED',
    label: 'Suivi quotidien connecté',
    description: 'Suivi patient à domicile et continuité établissement-domicile.',
  },
  diagnosticAssistant: {
    id: 'diagnostic-assistant',
    requiredLayer: 'DIAGNOSTIC',
    label: 'Assistant diagnostique',
    description: 'Analyse et suggestions intelligentes destinées aux professionnels.',
  },
  intelligentTranscription: {
    id: 'intelligent-transcription',
    requiredLayer: 'DIAGNOSTIC',
    label: 'Transcription intelligente',
    description: 'Structuration et analyse intelligentes à valider par le clinicien.',
  },
} as const satisfies Record<string, AuliaCapability>;

export type AuliaCapabilityId = keyof typeof AULIA_CAPABILITIES;

export type LayerSnapshot = {
  configured: boolean;
  enabledLayers: AuliaLayer[];
};

export function capabilityState(
  capabilityId: AuliaCapabilityId,
  layers: LayerSnapshot,
) {
  const capability = AULIA_CAPABILITIES[capabilityId];
  const enabled = layers.configured && layers.enabledLayers.includes(capability.requiredLayer);
  return {
    capability,
    visible: true,
    enabled,
    locked: !enabled,
    requiredLayer: capability.requiredLayer,
  };
}

export function layersForPath(pathname: string): AuliaLayer[] | null {
  if (pathname.startsWith('/dev/')) return null;
  if (
    [
      '/montre-connectee',
      '/enfants',
      '/reception/montres',
      '/administration/montres',
      '/connected-care',
      '/suivi-quotidien',
      '/telehealth',
      '/teleconsultation',
    ].some((path) => pathname.startsWith(path))
  ) return ['CONNECTED'];
  if (
    ['/clinical-intelligence', '/intelligence', '/diagnostic-agent'].some((path) =>
      pathname.startsWith(path),
    )
  ) return ['DIAGNOSTIC'];
  return ['CORE'];
}
