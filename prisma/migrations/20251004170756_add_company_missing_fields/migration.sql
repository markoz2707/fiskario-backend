-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "regon" TEXT,
ADD COLUMN     "taxOffice" TEXT,
ADD COLUMN     "vatStatus" TEXT;
