/*
  Warnings:

  - You are about to drop the column `buyerAddress` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `buyerName` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `buyerNip` on the `Invoice` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "buyerAddress",
DROP COLUMN "buyerName",
DROP COLUMN "buyerNip",
ADD COLUMN     "buyer_id" TEXT;

-- CreateTable
CREATE TABLE "Buyer" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nip" TEXT,
    "nipEncrypted" TEXT,
    "address" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'PL',
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Buyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalCertificate" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "certificateType" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "certificateData" TEXT NOT NULL,
    "privateKey" TEXT,
    "keyAlgorithm" TEXT NOT NULL,
    "keySize" INTEGER NOT NULL,
    "trustedServiceProvider" TEXT,
    "userIdentifier" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "renewalReminderDays" INTEGER NOT NULL DEFAULT 30,
    "lastValidationAt" TIMESTAMP(3),
    "validationStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigitalCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureRecord" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "certificate_id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "signatureType" TEXT NOT NULL,
    "signatureFormat" TEXT NOT NULL,
    "signatureValue" TEXT NOT NULL,
    "signedContent" TEXT NOT NULL,
    "signedDocument" TEXT,
    "timestamp" TIMESTAMP(3),
    "tspProvider" TEXT,
    "validationStatus" TEXT NOT NULL DEFAULT 'pending',
    "validationErrors" TEXT,
    "signerName" TEXT NOT NULL,
    "signerIdentifier" TEXT NOT NULL,
    "signatureAlgorithm" TEXT NOT NULL,
    "hashAlgorithm" TEXT NOT NULL,
    "isLongTermValid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfilZaufanyProfile" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "pesel" TEXT NOT NULL,
    "peselEncrypted" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "authenticationLevel" TEXT NOT NULL DEFAULT 'basic',
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfilZaufanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EPUAPService" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "requiredAuthLevel" TEXT NOT NULL DEFAULT 'basic',
    "endpointUrl" TEXT NOT NULL,
    "documentationUrl" TEXT,
    "estimatedTime" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EPUAPService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Buyer_tenant_id_idx" ON "Buyer"("tenant_id");

-- CreateIndex
CREATE INDEX "Buyer_nip_idx" ON "Buyer"("nip");

-- CreateIndex
CREATE INDEX "Buyer_isActive_idx" ON "Buyer"("isActive");

-- CreateIndex
CREATE INDEX "DigitalCertificate_tenant_id_idx" ON "DigitalCertificate"("tenant_id");

-- CreateIndex
CREATE INDEX "DigitalCertificate_company_id_idx" ON "DigitalCertificate"("company_id");

-- CreateIndex
CREATE INDEX "DigitalCertificate_certificateType_idx" ON "DigitalCertificate"("certificateType");

-- CreateIndex
CREATE INDEX "DigitalCertificate_status_idx" ON "DigitalCertificate"("status");

-- CreateIndex
CREATE INDEX "DigitalCertificate_userIdentifier_idx" ON "DigitalCertificate"("userIdentifier");

-- CreateIndex
CREATE INDEX "DigitalCertificate_validTo_idx" ON "DigitalCertificate"("validTo");

-- CreateIndex
CREATE INDEX "DigitalCertificate_isDefault_idx" ON "DigitalCertificate"("isDefault");

-- CreateIndex
CREATE INDEX "SignatureRecord_tenant_id_idx" ON "SignatureRecord"("tenant_id");

-- CreateIndex
CREATE INDEX "SignatureRecord_company_id_idx" ON "SignatureRecord"("company_id");

-- CreateIndex
CREATE INDEX "SignatureRecord_certificate_id_idx" ON "SignatureRecord"("certificate_id");

-- CreateIndex
CREATE INDEX "SignatureRecord_documentId_idx" ON "SignatureRecord"("documentId");

-- CreateIndex
CREATE INDEX "SignatureRecord_documentType_idx" ON "SignatureRecord"("documentType");

-- CreateIndex
CREATE INDEX "SignatureRecord_signatureType_idx" ON "SignatureRecord"("signatureType");

-- CreateIndex
CREATE INDEX "SignatureRecord_validationStatus_idx" ON "SignatureRecord"("validationStatus");

-- CreateIndex
CREATE INDEX "SignatureRecord_createdAt_idx" ON "SignatureRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProfilZaufanyProfile_profileId_key" ON "ProfilZaufanyProfile"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfilZaufanyProfile_pesel_key" ON "ProfilZaufanyProfile"("pesel");

-- CreateIndex
CREATE INDEX "ProfilZaufanyProfile_tenant_id_idx" ON "ProfilZaufanyProfile"("tenant_id");

-- CreateIndex
CREATE INDEX "ProfilZaufanyProfile_company_id_idx" ON "ProfilZaufanyProfile"("company_id");

-- CreateIndex
CREATE INDEX "ProfilZaufanyProfile_pesel_idx" ON "ProfilZaufanyProfile"("pesel");

-- CreateIndex
CREATE INDEX "ProfilZaufanyProfile_isActive_idx" ON "ProfilZaufanyProfile"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EPUAPService_serviceId_key" ON "EPUAPService"("serviceId");

-- CreateIndex
CREATE INDEX "EPUAPService_category_idx" ON "EPUAPService"("category");

-- CreateIndex
CREATE INDEX "EPUAPService_isAvailable_idx" ON "EPUAPService"("isAvailable");

-- CreateIndex
CREATE INDEX "EPUAPService_requiredAuthLevel_idx" ON "EPUAPService"("requiredAuthLevel");

-- CreateIndex
CREATE INDEX "Invoice_buyer_id_idx" ON "Invoice"("buyer_id");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "Buyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalCertificate" ADD CONSTRAINT "DigitalCertificate_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRecord" ADD CONSTRAINT "SignatureRecord_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRecord" ADD CONSTRAINT "SignatureRecord_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "DigitalCertificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfilZaufanyProfile" ADD CONSTRAINT "ProfilZaufanyProfile_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
