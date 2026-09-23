-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('CONSULTATION', 'LABORATORY', 'IMAGING', 'PHARMACY', 'ADMINISTRATION', 'OTHER_CLINICAL');

-- DropIndex
DROP INDEX "Department_code_key";

-- DropIndex
DROP INDEX "Department_name_key";

-- DropIndex
DROP INDEX "ImagingCatalogue_code_key";

-- DropIndex
DROP INDEX "OperatingRoom_name_key";

-- DropIndex
DROP INDEX "Service_name_key";

-- DropIndex
DROP INDEX "WearableLot_manufacturer_receivedAt_idx";

-- DropIndex
DROP INDEX "WearableLot_reference_key";

-- DropIndex
DROP INDEX "WearablePlan_manufacturer_key";

-- AlterTable
ALTER TABLE "PlatformLayerConfiguration" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "category" "ServiceCategory" NOT NULL DEFAULT 'CONSULTATION';

-- AlterTable
ALTER TABLE "ServiceUnit" ADD COLUMN     "category" "ServiceCategory" NOT NULL DEFAULT 'CONSULTATION';
