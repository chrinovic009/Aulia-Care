import { DepartmentType, ServiceCategory } from '@prisma/client';

/**
 * Maps the structured department taxonomy to the service taxonomy. Display
 * names are deliberately not consulted: a label may be renamed or translated
 * without changing clinical routing.
 */
export function categoryForDepartmentType(
  departmentType: DepartmentType,
): ServiceCategory {
  switch (departmentType) {
    case DepartmentType.RECEPTION:
    case DepartmentType.BILLING:
    case DepartmentType.ADMINISTRATION:
      return ServiceCategory.ADMINISTRATION;
    case DepartmentType.LABORATORY:
      return ServiceCategory.LABORATORY;
    case DepartmentType.RADIOLOGY:
      return ServiceCategory.IMAGING;
    case DepartmentType.PHARMACY:
      return ServiceCategory.PHARMACY;
    case DepartmentType.MEDICAL:
      return ServiceCategory.CONSULTATION;
    case DepartmentType.NURSING:
    case DepartmentType.SURGERY:
      return ServiceCategory.OTHER_CLINICAL;
    default: {
      const exhaustive: never = departmentType;
      return exhaustive;
    }
  }
}

export function isAdministrativeServiceCategory(
  category?: ServiceCategory | null,
) {
  return category === ServiceCategory.ADMINISTRATION;
}
