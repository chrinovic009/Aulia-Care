import assert from 'node:assert/strict';
import test from 'node:test';
import {
  capabilityState,
  layersForPath,
  type AuliaLayer,
} from './auliaCapabilities';

const combinations: Array<[string, AuliaLayer[]]> = [
  ['CORE', ['CORE']],
  ['CONNECTED', ['CONNECTED']],
  ['DIAGNOSTIC', ['DIAGNOSTIC']],
  ['CORE + CONNECTED', ['CORE', 'CONNECTED']],
  ['CORE + DIAGNOSTIC', ['CORE', 'DIAGNOSTIC']],
  ['CONNECTED + DIAGNOSTIC', ['CONNECTED', 'DIAGNOSTIC']],
  ['ALL', ['CORE', 'CONNECTED', 'DIAGNOSTIC']],
];

for (const [label, enabledLayers] of combinations) {
  test(`keeps representative capabilities visible and correctly locked for ${label}`, () => {
    const snapshot = { configured: true, enabledLayers };
    const core = capabilityState('patientRecord', snapshot);
    const connected = capabilityState('teleconsultation', snapshot);
    const wearable = capabilityState('wearableMonitoring', snapshot);
    const diagnostic = capabilityState('diagnosticAssistant', snapshot);

    assert.equal(core.visible && connected.visible && wearable.visible && diagnostic.visible, true);
    assert.equal(core.enabled, enabledLayers.includes('CORE'));
    assert.equal(connected.enabled, enabledLayers.includes('CONNECTED'));
    assert.equal(wearable.locked, !enabledLayers.includes('CONNECTED'));
    assert.equal(diagnostic.locked, !enabledLayers.includes('DIAGNOSTIC'));
  });
}

test('assigns telehealth and daily connected care to Connected, not Diagnostic', () => {
  assert.deepEqual(layersForPath('/teleconsultation'), ['CONNECTED']);
  assert.deepEqual(layersForPath('/telehealth/call'), ['CONNECTED']);
  assert.deepEqual(layersForPath('/suivi-quotidien'), ['CONNECTED']);
  assert.deepEqual(layersForPath('/intelligence'), ['DIAGNOSTIC']);
});

test('fails closed in the visibility model when no tenant configuration exists', () => {
  const state = capabilityState('patientRecord', {
    configured: false,
    enabledLayers: [],
  });
  assert.equal(state.visible, true);
  assert.equal(state.locked, true);
});
