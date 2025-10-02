import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@fiskario.com' },
    update: {},
    create: {
      email: 'admin@fiskario.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      isEmailVerified: true,
      createdAt: new Date(),
    },
  });

  console.log('✅ Created admin user:', adminUser.email);

  // Create test company
  const testCompany = await prisma.company.upsert({
    where: { id: 'test-company-id' },
    update: {},
    create: {
      id: 'test-company-id',
      name: 'Fiskario Test Company',
      nip: '1234567890',
      address: 'Test Street 123, 00-001 Warsaw, Poland',
      phone: '+48 123 456 789',
      email: 'contact@fiskario.com',
      website: 'https://fiskario.com',
      isActive: true,
      createdAt: new Date(),
    },
  });

  console.log('✅ Created test company:', testCompany.name);

  // Create sample invoices
  const sampleInvoices = [
    {
      invoiceNumber: 'INV/2024/001',
      issueDate: new Date('2024-01-15'),
      dueDate: new Date('2024-02-15'),
      amount: 1250.00,
      currency: 'PLN',
      status: 'PAID',
      companyId: testCompany.id,
    },
    {
      invoiceNumber: 'INV/2024/002',
      issueDate: new Date('2024-02-01'),
      dueDate: new Date('2024-03-01'),
      amount: 2500.00,
      currency: 'PLN',
      status: 'SENT',
      companyId: testCompany.id,
    },
    {
      invoiceNumber: 'INV/2024/003',
      issueDate: new Date('2024-02-15'),
      dueDate: new Date('2024-03-15'),
      amount: 875.50,
      currency: 'PLN',
      status: 'DRAFT',
      companyId: testCompany.id,
    },
  ];

  for (const invoiceData of sampleInvoices) {
    const invoice = await prisma.invoice.upsert({
      where: { invoiceNumber: invoiceData.invoiceNumber },
      update: {},
      create: {
        ...invoiceData,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`✅ Created invoice: ${invoice.invoiceNumber} - ${invoice.amount} ${invoice.currency}`);
  }

  // Create sample ZUS contributions
  const zusContributions = [
    {
      period: '2024-01',
      contributionType: 'SOCIAL_INSURANCE',
      amount: 1250.00,
      dueDate: new Date('2024-02-15'),
      status: 'PAID',
      companyId: testCompany.id,
    },
    {
      period: '2024-01',
      contributionType: 'HEALTH_INSURANCE',
      amount: 450.00,
      dueDate: new Date('2024-02-15'),
      status: 'PAID',
      companyId: testCompany.id,
    },
    {
      period: '2024-02',
      contributionType: 'SOCIAL_INSURANCE',
      amount: 1300.00,
      dueDate: new Date('2024-03-15'),
      status: 'PENDING',
      companyId: testCompany.id,
    },
  ];

  for (const zusData of zusContributions) {
    const zus = await prisma.zUSContribution.upsert({
      where: {
        companyId_period_contributionType: {
          companyId: zusData.companyId,
          period: zusData.period,
          contributionType: zusData.contributionType,
        },
      },
      update: {},
      create: {
        ...zusData,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`✅ Created ZUS contribution: ${zus.period} - ${zus.contributionType} - ${zus.amount} PLN`);
  }

  // Create sample tax declarations
  const taxDeclarations = [
    {
      declarationType: 'PIT_36',
      taxYear: 2023,
      submissionDate: new Date('2024-04-30'),
      status: 'SUBMITTED',
      companyId: testCompany.id,
    },
    {
      declarationType: 'VAT_7',
      taxYear: 2024,
      submissionDate: new Date('2024-02-25'),
      status: 'SUBMITTED',
      companyId: testCompany.id,
    },
    {
      declarationType: 'CIT_8',
      taxYear: 2023,
      submissionDate: new Date('2024-03-31'),
      status: 'SUBMITTED',
      companyId: testCompany.id,
    },
  ];

  for (const declarationData of taxDeclarations) {
    const declaration = await prisma.declaration.upsert({
      where: {
        companyId_declarationType_taxYear: {
          companyId: declarationData.companyId,
          declarationType: declarationData.declarationType,
          taxYear: declarationData.taxYear,
        },
      },
      update: {},
      create: {
        ...declarationData,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`✅ Created declaration: ${declaration.declarationType} for ${declaration.taxYear}`);
  }

  // Create sample notifications
  const notifications = [
    {
      title: 'Tax Declaration Due Soon',
      message: 'Your VAT-7 declaration for February 2024 is due in 5 days.',
      type: 'DEADLINE_REMINDER',
      priority: 'HIGH',
      userId: adminUser.id,
      companyId: testCompany.id,
    },
    {
      title: 'Invoice Overdue',
      message: 'Invoice INV/2024/001 is now overdue by 15 days.',
      type: 'INVOICE_REMINDER',
      priority: 'MEDIUM',
      userId: adminUser.id,
      companyId: testCompany.id,
    },
    {
      title: 'ZUS Contribution Due',
      message: 'Your social insurance contribution for February 2024 is due on March 15th.',
      type: 'ZUS_REMINDER',
      priority: 'HIGH',
      userId: adminUser.id,
      companyId: testCompany.id,
    },
  ];

  for (const notificationData of notifications) {
    const notification = await prisma.notification.upsert({
      where: {
        userId_companyId_title: {
          userId: notificationData.userId,
          companyId: notificationData.companyId,
          title: notificationData.title,
        },
      },
      update: {},
      create: {
        ...notificationData,
        isRead: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`✅ Created notification: ${notification.title}`);
  }

  console.log('🎉 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during database seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });