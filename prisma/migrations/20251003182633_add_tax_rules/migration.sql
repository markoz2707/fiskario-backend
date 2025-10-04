-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "passwordEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nip" TEXT,
    "nipEncrypted" TEXT,
    "address" TEXT,
    "taxForm" TEXT,
    "vatPayer" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "buyerName" TEXT NOT NULL,
    "buyerNip" TEXT,
    "buyerAddress" TEXT,
    "totalNet" DOUBLE PRECISION NOT NULL,
    "totalVat" DOUBLE PRECISION NOT NULL,
    "totalGross" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "pdfUrl" TEXT,
    "ksefStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "vatRate" DOUBLE PRECISION NOT NULL,
    "gtu" TEXT,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "vatAmount" DOUBLE PRECISION NOT NULL,
    "grossAmount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Declaration" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "variant" TEXT,
    "data" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMP(3),
    "upoNumber" TEXT,
    "upoDate" TIMESTAMP(3),
    "xmlContent" TEXT,
    "signatureType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Declaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZUSEmployee" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "pesel" TEXT,
    "peselEncrypted" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "employmentDate" TIMESTAMP(3) NOT NULL,
    "terminationDate" TIMESTAMP(3),
    "insuranceStartDate" TIMESTAMP(3) NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "contractType" TEXT NOT NULL,
    "salaryBasis" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZUSEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZUSRegistration" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "formType" TEXT NOT NULL,
    "registrationDate" TIMESTAMP(3) NOT NULL,
    "insuranceTypes" JSONB NOT NULL,
    "contributionBasis" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "zusReferenceNumber" TEXT,
    "upoNumber" TEXT,
    "upoDate" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZUSRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZUSReport" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "totalEmployees" INTEGER NOT NULL DEFAULT 0,
    "totalContributions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "zusReferenceNumber" TEXT,
    "upoNumber" TEXT,
    "upoDate" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZUSReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZUSContribution" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT,
    "report_id" TEXT,
    "period" TEXT NOT NULL,
    "contributionDate" TIMESTAMP(3) NOT NULL,
    "emerytalnaEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "emerytalnaEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rentowaEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rentowaEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "chorobowaEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wypadkowaEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "zdrowotnaEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "zdrowotnaDeductible" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fpEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fgspEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "basisEmerytalnaRentowa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "basisChorobowa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "basisZdrowotna" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "basisFPFGSP" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "zusFormType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'calculated',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZUSContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZUSSubmission" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZUSSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskQueue" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VATRegister" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "counterpartyName" TEXT NOT NULL,
    "counterpartyNIP" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "vatAmount" DOUBLE PRECISION NOT NULL,
    "vatRate" DOUBLE PRECISION NOT NULL,
    "gtuCode" TEXT,
    "documentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VATRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCalculation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "declarationType" TEXT NOT NULL,
    "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatCollectedSales" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatPaidPurchases" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxDeductibleCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableIncome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxBase" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "previousAdvance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advanceToPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "calculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "variables" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadlineReminder" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "deadlineId" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reminderType" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeadlineReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadlineCompletion" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "deadlineId" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "DeadlineCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficialCommunication" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "officialBody" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "upoNumber" TEXT,
    "description" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "responseRequired" BOOLEAN NOT NULL DEFAULT false,
    "responseDeadline" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficialCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataProcessingRecord" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "dataSubjectId" TEXT NOT NULL,
    "dataCategory" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "legalBasis" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "consentId" TEXT,
    "withdrawalDate" TIMESTAMP(3),
    "withdrawalReason" TEXT,
    "metadata" JSONB,
    "additionalData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataProcessingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "dataSubjectId" TEXT NOT NULL,
    "purposes" TEXT[],
    "legalBasis" TEXT NOT NULL,
    "consentMethod" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "consentDate" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL,
    "withdrawalDate" TIMESTAMP(3),
    "withdrawalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyNotice" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "noticeType" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL,
    "jurisdictions" TEXT[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyNoticeSection" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "sectionType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyNoticeSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyNoticeView" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "userId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptanceToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivacyNoticeView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAudit" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "findings" JSONB,
    "recommendations" JSONB,
    "evidence" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceReport" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "summary" JSONB NOT NULL,
    "trends" JSONB NOT NULL,
    "checks" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnomalyAlert" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "userId" TEXT,
    "companyId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnomalyAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBehaviorProfile" (
    "userId" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "baselineLoginTimes" JSONB NOT NULL,
    "baselineActions" JSONB NOT NULL,
    "baselineDataAccess" JSONB NOT NULL,
    "geographicLocations" JSONB NOT NULL,
    "deviceFingerprints" JSONB NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBehaviorProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ConsentTemplate" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "purposes" TEXT[],
    "legalBasis" TEXT NOT NULL,
    "consentMethod" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DPIADocument" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "processingActivity" TEXT NOT NULL,
    "assessor" TEXT NOT NULL,
    "assessmentDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "conclusion" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DPIADocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DPIASection" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sectionName" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DPIASection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DPIAActivity" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "activityName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "mitigationSteps" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DPIAActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "riskCategory" TEXT NOT NULL,
    "riskDescription" TEXT NOT NULL,
    "likelihood" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "mitigationMeasures" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MitigationMeasure" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "measure" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "deadline" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MitigationMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCheck" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "findings" JSONB,
    "recommendations" JSONB,
    "lastChecked" TIMESTAMP(3) NOT NULL,
    "nextCheckDue" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacySettings" (
    "dataSubjectId" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "dataSharing" BOOLEAN NOT NULL DEFAULT false,
    "marketingCommunications" BOOLEAN NOT NULL DEFAULT false,
    "analyticsTracking" BOOLEAN NOT NULL DEFAULT false,
    "thirdPartyCookies" BOOLEAN NOT NULL DEFAULT false,
    "dataRetention" INTEGER NOT NULL DEFAULT 365,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacySettings_pkey" PRIMARY KEY ("dataSubjectId")
);

-- CreateTable
CREATE TABLE "DataBreachRecord" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "affectedDataSubjects" INTEGER NOT NULL,
    "affectedDataCategories" TEXT[],
    "reportedDate" TIMESTAMP(3) NOT NULL,
    "detectionDate" TIMESTAMP(3) NOT NULL,
    "containmentDate" TIMESTAMP(3),
    "notificationDate" TIMESTAMP(3),
    "supervisoryAuthorityNotified" BOOLEAN NOT NULL DEFAULT false,
    "dataSubjectsNotified" BOOLEAN NOT NULL DEFAULT false,
    "mitigationSteps" JSONB,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataBreachRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxForm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "parameters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "taxFormId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "calculationMethod" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "minBase" DOUBLE PRECISION,
    "maxBase" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyTaxSettings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "taxFormId" TEXT NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyTaxSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_RoleToUser" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RoleToUser_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_PermissionToRole" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PermissionToRole_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenant_id_idx" ON "User"("tenant_id");

-- CreateIndex
CREATE INDEX "Role_tenant_id_idx" ON "Role"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_name_key" ON "Permission"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Company_tenant_id_key" ON "Company"("tenant_id");

-- CreateIndex
CREATE INDEX "Company_tenant_id_idx" ON "Company"("tenant_id");

-- CreateIndex
CREATE INDEX "Invoice_tenant_id_idx" ON "Invoice"("tenant_id");

-- CreateIndex
CREATE INDEX "Declaration_tenant_id_idx" ON "Declaration"("tenant_id");

-- CreateIndex
CREATE INDEX "Declaration_company_id_idx" ON "Declaration"("company_id");

-- CreateIndex
CREATE INDEX "Declaration_type_idx" ON "Declaration"("type");

-- CreateIndex
CREATE INDEX "Declaration_period_idx" ON "Declaration"("period");

-- CreateIndex
CREATE INDEX "ZUSEmployee_tenant_id_idx" ON "ZUSEmployee"("tenant_id");

-- CreateIndex
CREATE INDEX "ZUSEmployee_company_id_idx" ON "ZUSEmployee"("company_id");

-- CreateIndex
CREATE INDEX "ZUSEmployee_pesel_idx" ON "ZUSEmployee"("pesel");

-- CreateIndex
CREATE INDEX "ZUSRegistration_tenant_id_idx" ON "ZUSRegistration"("tenant_id");

-- CreateIndex
CREATE INDEX "ZUSRegistration_company_id_idx" ON "ZUSRegistration"("company_id");

-- CreateIndex
CREATE INDEX "ZUSRegistration_employee_id_idx" ON "ZUSRegistration"("employee_id");

-- CreateIndex
CREATE INDEX "ZUSRegistration_formType_idx" ON "ZUSRegistration"("formType");

-- CreateIndex
CREATE INDEX "ZUSReport_tenant_id_idx" ON "ZUSReport"("tenant_id");

-- CreateIndex
CREATE INDEX "ZUSReport_company_id_idx" ON "ZUSReport"("company_id");

-- CreateIndex
CREATE INDEX "ZUSReport_reportType_idx" ON "ZUSReport"("reportType");

-- CreateIndex
CREATE INDEX "ZUSReport_period_idx" ON "ZUSReport"("period");

-- CreateIndex
CREATE INDEX "ZUSContribution_tenant_id_idx" ON "ZUSContribution"("tenant_id");

-- CreateIndex
CREATE INDEX "ZUSContribution_company_id_idx" ON "ZUSContribution"("company_id");

-- CreateIndex
CREATE INDEX "ZUSContribution_employee_id_idx" ON "ZUSContribution"("employee_id");

-- CreateIndex
CREATE INDEX "ZUSContribution_period_idx" ON "ZUSContribution"("period");

-- CreateIndex
CREATE INDEX "ZUSSubmission_tenant_id_idx" ON "ZUSSubmission"("tenant_id");

-- CreateIndex
CREATE INDEX "TaskQueue_tenant_id_idx" ON "TaskQueue"("tenant_id");

-- CreateIndex
CREATE INDEX "TaskQueue_status_idx" ON "TaskQueue"("status");

-- CreateIndex
CREATE INDEX "TaskQueue_nextRetryAt_idx" ON "TaskQueue"("nextRetryAt");

-- CreateIndex
CREATE INDEX "VATRegister_tenant_id_idx" ON "VATRegister"("tenant_id");

-- CreateIndex
CREATE INDEX "VATRegister_company_id_idx" ON "VATRegister"("company_id");

-- CreateIndex
CREATE INDEX "VATRegister_period_idx" ON "VATRegister"("period");

-- CreateIndex
CREATE INDEX "VATRegister_type_idx" ON "VATRegister"("type");

-- CreateIndex
CREATE INDEX "TaxCalculation_tenant_id_idx" ON "TaxCalculation"("tenant_id");

-- CreateIndex
CREATE INDEX "TaxCalculation_company_id_idx" ON "TaxCalculation"("company_id");

-- CreateIndex
CREATE INDEX "TaxCalculation_period_idx" ON "TaxCalculation"("period");

-- CreateIndex
CREATE INDEX "TaxCalculation_declarationType_idx" ON "TaxCalculation"("declarationType");

-- CreateIndex
CREATE INDEX "AuditLog_tenant_id_idx" ON "AuditLog"("tenant_id");

-- CreateIndex
CREATE INDEX "AuditLog_company_id_idx" ON "AuditLog"("company_id");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationTemplate_tenant_id_idx" ON "NotificationTemplate"("tenant_id");

-- CreateIndex
CREATE INDEX "NotificationTemplate_type_idx" ON "NotificationTemplate"("type");

-- CreateIndex
CREATE INDEX "Notification_tenant_id_idx" ON "Notification"("tenant_id");

-- CreateIndex
CREATE INDEX "Notification_user_id_idx" ON "Notification"("user_id");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE INDEX "Notification_scheduledFor_idx" ON "Notification"("scheduledFor");

-- CreateIndex
CREATE INDEX "DeadlineReminder_tenant_id_idx" ON "DeadlineReminder"("tenant_id");

-- CreateIndex
CREATE INDEX "DeadlineReminder_user_id_idx" ON "DeadlineReminder"("user_id");

-- CreateIndex
CREATE INDEX "DeadlineReminder_deadlineId_idx" ON "DeadlineReminder"("deadlineId");

-- CreateIndex
CREATE INDEX "DeadlineReminder_scheduledFor_idx" ON "DeadlineReminder"("scheduledFor");

-- CreateIndex
CREATE INDEX "DeadlineCompletion_tenant_id_idx" ON "DeadlineCompletion"("tenant_id");

-- CreateIndex
CREATE INDEX "DeadlineCompletion_deadlineId_idx" ON "DeadlineCompletion"("deadlineId");

-- CreateIndex
CREATE INDEX "DeadlineCompletion_user_id_idx" ON "DeadlineCompletion"("user_id");

-- CreateIndex
CREATE INDEX "OfficialCommunication_tenant_id_idx" ON "OfficialCommunication"("tenant_id");

-- CreateIndex
CREATE INDEX "OfficialCommunication_company_id_idx" ON "OfficialCommunication"("company_id");

-- CreateIndex
CREATE INDEX "OfficialCommunication_entityType_idx" ON "OfficialCommunication"("entityType");

-- CreateIndex
CREATE INDEX "OfficialCommunication_entityId_idx" ON "OfficialCommunication"("entityId");

-- CreateIndex
CREATE INDEX "OfficialCommunication_officialBody_idx" ON "OfficialCommunication"("officialBody");

-- CreateIndex
CREATE INDEX "OfficialCommunication_status_idx" ON "OfficialCommunication"("status");

-- CreateIndex
CREATE INDEX "OfficialCommunication_createdAt_idx" ON "OfficialCommunication"("createdAt");

-- CreateIndex
CREATE INDEX "DataProcessingRecord_tenant_id_idx" ON "DataProcessingRecord"("tenant_id");

-- CreateIndex
CREATE INDEX "DataProcessingRecord_dataSubjectId_idx" ON "DataProcessingRecord"("dataSubjectId");

-- CreateIndex
CREATE INDEX "DataProcessingRecord_status_idx" ON "DataProcessingRecord"("status");

-- CreateIndex
CREATE INDEX "ConsentRecord_tenant_id_idx" ON "ConsentRecord"("tenant_id");

-- CreateIndex
CREATE INDEX "ConsentRecord_dataSubjectId_idx" ON "ConsentRecord"("dataSubjectId");

-- CreateIndex
CREATE INDEX "ConsentRecord_status_idx" ON "ConsentRecord"("status");

-- CreateIndex
CREATE INDEX "PrivacyNotice_tenant_id_idx" ON "PrivacyNotice"("tenant_id");

-- CreateIndex
CREATE INDEX "PrivacyNotice_noticeType_idx" ON "PrivacyNotice"("noticeType");

-- CreateIndex
CREATE INDEX "PrivacyNotice_isActive_idx" ON "PrivacyNotice"("isActive");

-- CreateIndex
CREATE INDEX "PrivacyNoticeSection_noticeId_idx" ON "PrivacyNoticeSection"("noticeId");

-- CreateIndex
CREATE INDEX "PrivacyNoticeView_noticeId_idx" ON "PrivacyNoticeView"("noticeId");

-- CreateIndex
CREATE INDEX "PrivacyNoticeView_userId_idx" ON "PrivacyNoticeView"("userId");

-- CreateIndex
CREATE INDEX "PrivacyNoticeView_viewedAt_idx" ON "PrivacyNoticeView"("viewedAt");

-- CreateIndex
CREATE INDEX "SecurityAudit_tenant_id_idx" ON "SecurityAudit"("tenant_id");

-- CreateIndex
CREATE INDEX "SecurityAudit_type_idx" ON "SecurityAudit"("type");

-- CreateIndex
CREATE INDEX "SecurityAudit_status_idx" ON "SecurityAudit"("status");

-- CreateIndex
CREATE INDEX "SecurityAudit_timestamp_idx" ON "SecurityAudit"("timestamp");

-- CreateIndex
CREATE INDEX "ComplianceReport_tenant_id_idx" ON "ComplianceReport"("tenant_id");

-- CreateIndex
CREATE INDEX "ComplianceReport_generatedAt_idx" ON "ComplianceReport"("generatedAt");

-- CreateIndex
CREATE INDEX "AnomalyAlert_tenant_id_idx" ON "AnomalyAlert"("tenant_id");

-- CreateIndex
CREATE INDEX "AnomalyAlert_ruleId_idx" ON "AnomalyAlert"("ruleId");

-- CreateIndex
CREATE INDEX "AnomalyAlert_userId_idx" ON "AnomalyAlert"("userId");

-- CreateIndex
CREATE INDEX "AnomalyAlert_companyId_idx" ON "AnomalyAlert"("companyId");

-- CreateIndex
CREATE INDEX "AnomalyAlert_status_idx" ON "AnomalyAlert"("status");

-- CreateIndex
CREATE INDEX "AnomalyAlert_detectedAt_idx" ON "AnomalyAlert"("detectedAt");

-- CreateIndex
CREATE INDEX "UserBehaviorProfile_tenant_id_idx" ON "UserBehaviorProfile"("tenant_id");

-- CreateIndex
CREATE INDEX "UserBehaviorProfile_companyId_idx" ON "UserBehaviorProfile"("companyId");

-- CreateIndex
CREATE INDEX "ConsentTemplate_tenant_id_idx" ON "ConsentTemplate"("tenant_id");

-- CreateIndex
CREATE INDEX "ConsentTemplate_isActive_idx" ON "ConsentTemplate"("isActive");

-- CreateIndex
CREATE INDEX "DPIADocument_tenant_id_idx" ON "DPIADocument"("tenant_id");

-- CreateIndex
CREATE INDEX "DPIADocument_company_id_idx" ON "DPIADocument"("company_id");

-- CreateIndex
CREATE INDEX "DPIADocument_status_idx" ON "DPIADocument"("status");

-- CreateIndex
CREATE INDEX "DPIASection_documentId_idx" ON "DPIASection"("documentId");

-- CreateIndex
CREATE INDEX "DPIAActivity_documentId_idx" ON "DPIAActivity"("documentId");

-- CreateIndex
CREATE INDEX "RiskAssessment_tenant_id_idx" ON "RiskAssessment"("tenant_id");

-- CreateIndex
CREATE INDEX "RiskAssessment_documentId_idx" ON "RiskAssessment"("documentId");

-- CreateIndex
CREATE INDEX "MitigationMeasure_tenant_id_idx" ON "MitigationMeasure"("tenant_id");

-- CreateIndex
CREATE INDEX "MitigationMeasure_riskId_idx" ON "MitigationMeasure"("riskId");

-- CreateIndex
CREATE INDEX "ComplianceCheck_tenant_id_idx" ON "ComplianceCheck"("tenant_id");

-- CreateIndex
CREATE INDEX "ComplianceCheck_checkId_idx" ON "ComplianceCheck"("checkId");

-- CreateIndex
CREATE INDEX "ComplianceCheck_category_idx" ON "ComplianceCheck"("category");

-- CreateIndex
CREATE INDEX "ComplianceCheck_status_idx" ON "ComplianceCheck"("status");

-- CreateIndex
CREATE INDEX "PrivacySettings_tenant_id_idx" ON "PrivacySettings"("tenant_id");

-- CreateIndex
CREATE INDEX "DataBreachRecord_tenant_id_idx" ON "DataBreachRecord"("tenant_id");

-- CreateIndex
CREATE INDEX "DataBreachRecord_type_idx" ON "DataBreachRecord"("type");

-- CreateIndex
CREATE INDEX "DataBreachRecord_severity_idx" ON "DataBreachRecord"("severity");

-- CreateIndex
CREATE INDEX "DataBreachRecord_reportedDate_idx" ON "DataBreachRecord"("reportedDate");

-- CreateIndex
CREATE UNIQUE INDEX "TaxForm_code_key" ON "TaxForm"("code");

-- CreateIndex
CREATE INDEX "TaxForm_category_idx" ON "TaxForm"("category");

-- CreateIndex
CREATE INDEX "TaxForm_isActive_idx" ON "TaxForm"("isActive");

-- CreateIndex
CREATE INDEX "TaxRule_taxFormId_idx" ON "TaxRule"("taxFormId");

-- CreateIndex
CREATE INDEX "TaxRule_ruleType_idx" ON "TaxRule"("ruleType");

-- CreateIndex
CREATE INDEX "TaxRule_isActive_idx" ON "TaxRule"("isActive");

-- CreateIndex
CREATE INDEX "CompanyTaxSettings_tenant_id_idx" ON "CompanyTaxSettings"("tenant_id");

-- CreateIndex
CREATE INDEX "CompanyTaxSettings_company_id_idx" ON "CompanyTaxSettings"("company_id");

-- CreateIndex
CREATE INDEX "CompanyTaxSettings_taxFormId_idx" ON "CompanyTaxSettings"("taxFormId");

-- CreateIndex
CREATE INDEX "CompanyTaxSettings_isSelected_idx" ON "CompanyTaxSettings"("isSelected");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyTaxSettings_tenant_id_company_id_taxFormId_key" ON "CompanyTaxSettings"("tenant_id", "company_id", "taxFormId");

-- CreateIndex
CREATE INDEX "_RoleToUser_B_index" ON "_RoleToUser"("B");

-- CreateIndex
CREATE INDEX "_PermissionToRole_B_index" ON "_PermissionToRole"("B");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Declaration" ADD CONSTRAINT "Declaration_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZUSEmployee" ADD CONSTRAINT "ZUSEmployee_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZUSRegistration" ADD CONSTRAINT "ZUSRegistration_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZUSRegistration" ADD CONSTRAINT "ZUSRegistration_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "ZUSEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZUSReport" ADD CONSTRAINT "ZUSReport_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZUSContribution" ADD CONSTRAINT "ZUSContribution_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZUSContribution" ADD CONSTRAINT "ZUSContribution_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "ZUSEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZUSContribution" ADD CONSTRAINT "ZUSContribution_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "ZUSReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZUSSubmission" ADD CONSTRAINT "ZUSSubmission_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VATRegister" ADD CONSTRAINT "VATRegister_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCalculation" ADD CONSTRAINT "TaxCalculation_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyNoticeSection" ADD CONSTRAINT "PrivacyNoticeSection_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "PrivacyNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyNoticeView" ADD CONSTRAINT "PrivacyNoticeView_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "PrivacyNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DPIADocument" ADD CONSTRAINT "DPIADocument_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DPIASection" ADD CONSTRAINT "DPIASection_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DPIADocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DPIAActivity" ADD CONSTRAINT "DPIAActivity_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DPIADocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_taxFormId_fkey" FOREIGN KEY ("taxFormId") REFERENCES "TaxForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyTaxSettings" ADD CONSTRAINT "CompanyTaxSettings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyTaxSettings" ADD CONSTRAINT "CompanyTaxSettings_taxFormId_fkey" FOREIGN KEY ("taxFormId") REFERENCES "TaxForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoleToUser" ADD CONSTRAINT "_RoleToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoleToUser" ADD CONSTRAINT "_RoleToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_A_fkey" FOREIGN KEY ("A") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_B_fkey" FOREIGN KEY ("B") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
