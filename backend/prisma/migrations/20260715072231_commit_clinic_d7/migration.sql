-- AlterTable
ALTER TABLE "AdmissionFee" ALTER COLUMN "currency" SET DEFAULT 'CDF';

-- AlterTable
ALTER TABLE "EmployeeContract" ALTER COLUMN "currency" SET DEFAULT 'CDF';

-- AlterTable
ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "currency" SET DEFAULT 'CDF';

-- AlterTable
ALTER TABLE "SubscriptionCharge" ALTER COLUMN "currency" SET DEFAULT 'CDF';
