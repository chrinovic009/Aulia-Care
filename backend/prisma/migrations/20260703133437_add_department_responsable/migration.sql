-- CreateTable
CREATE TABLE "DepartmentResponsable" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DepartmentResponsable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DepartmentResponsable_departmentId_idx" ON "DepartmentResponsable"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentResponsable_departmentId_userId_key" ON "DepartmentResponsable"("departmentId", "userId");

-- AddForeignKey
ALTER TABLE "DepartmentResponsable" ADD CONSTRAINT "DepartmentResponsable_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentResponsable" ADD CONSTRAINT "DepartmentResponsable_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
