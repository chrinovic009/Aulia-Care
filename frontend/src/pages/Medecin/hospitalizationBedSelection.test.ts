import test from 'node:test';
import assert from 'node:assert/strict';
import { getBedSelectionState } from './hospitalizationBedSelection.ts';

test('returns a fallback room when selected room has no free bed', () => {
  const rooms = [
    { id: 'room-1', number: 'Chambre 10', beds: [{ id: 'bed-1', code: 'A', status: 'OCCUPIED' }] },
    { id: 'room-2', number: 'Chambre 12', beds: [{ id: 'bed-2', code: 'B', status: 'FREE' }] },
  ];

  const result = getBedSelectionState(rooms, 'room-1');

  assert.equal(result.selectedRoomId, 'room-2');
  assert.equal(result.availableBeds.length, 1);
  assert.equal(result.message, 'Aucun lit disponible pour cette chambre. Utilisez la chambre Chambre 12.');
});

test('returns only free beds when the selected room still has availability', () => {
  const rooms = [
    { id: 'room-1', number: 'Chambre 10', beds: [{ id: 'bed-1', code: 'A', status: 'FREE' }, { id: 'bed-2', code: 'B', status: 'OCCUPIED' }] },
  ];

  const result = getBedSelectionState(rooms, 'room-1');

  assert.equal(result.selectedRoomId, 'room-1');
  assert.deepEqual(result.availableBeds.map((bed) => bed.id), ['bed-1']);
  assert.equal(result.message, null);
});
