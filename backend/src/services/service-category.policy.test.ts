import assert from 'node:assert/strict';
import test from 'node:test';
import { DepartmentType, ServiceCategory } from '@prisma/client';
import {
  categoryForDepartmentType,
  isAdministrativeServiceCategory,
} from './service-category.policy';

const categoryCases: Array<[DepartmentType, ServiceCategory]> = [
  [DepartmentType.RECEPTION, ServiceCategory.ADMINISTRATION],
  [DepartmentType.BILLING, ServiceCategory.ADMINISTRATION],
  [DepartmentType.ADMINISTRATION, ServiceCategory.ADMINISTRATION],
  [DepartmentType.LABORATORY, ServiceCategory.LABORATORY],
  [DepartmentType.RADIOLOGY, ServiceCategory.IMAGING],
  [DepartmentType.PHARMACY, ServiceCategory.PHARMACY],
  [DepartmentType.MEDICAL, ServiceCategory.CONSULTATION],
  [DepartmentType.NURSING, ServiceCategory.OTHER_CLINICAL],
  [DepartmentType.SURGERY, ServiceCategory.OTHER_CLINICAL],
];

for (const [department, expected] of categoryCases) {
  test(`maps ${department} deterministically to ${expected}`, () => {
    assert.equal(categoryForDepartmentType(department), expected);
  });
}

test('only the structured administration category is administrative', () => {
  assert.equal(isAdministrativeServiceCategory(ServiceCategory.ADMINISTRATION), true);
  assert.equal(isAdministrativeServiceCategory(ServiceCategory.CONSULTATION), false);
  assert.equal(isAdministrativeServiceCategory(ServiceCategory.LABORATORY), false);
});
