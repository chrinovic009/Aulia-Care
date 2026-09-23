import assert from 'node:assert/strict';
import test from 'node:test';
import { ROLES_KEY } from '../auth/roles.decorator';
import { LaboratoryController } from '../laboratory/laboratory.controller';
import { ImagingController } from '../imaging/imaging.controller';
import { PharmacyController } from '../pharmacy/pharmacy.controller';
import { RolesController } from '../roles/roles.controller';

const rolesFor = (prototype: object, method: string): string[] | undefined =>
  Reflect.getMetadata(ROLES_KEY, prototype[method as keyof typeof prototype]);

test('catalogue mutations are owned by their clinical service managers, never DEV', () => {
  for (const method of ['findAll', 'findOne', 'create', 'update', 'remove']) {
    assert.deepEqual(rolesFor(RolesController.prototype, method), ['DEV']);
  }

  for (const method of [
    'updateSettings',
    'createSection',
    'createCategory',
    'createTest',
    'createTestParameter',
    'createSampleType',
    'createSampleRequirement',
    'createConsumable',
    'createConsumableRequirement',
    'createConsumableStock',
    'updateCatalogue',
    'deleteCatalogue',
    'setDirectResultAuthorization',
  ]) {
    assert.deepEqual(rolesFor(LaboratoryController.prototype, method), ['LAB_MANAGER']);
  }

  for (const method of ['createSection', 'createCategory', 'createMedication']) {
    assert.deepEqual(rolesFor(PharmacyController.prototype, method), ['DEV']);
  }

  for (const method of ['createCatalogue', 'removeCatalogue']) {
    assert.deepEqual(rolesFor(ImagingController.prototype, method), ['RADIOLOGIST']);
  }
});
