import { PrismaClient } from '../../generated/prisma';
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
      tenant_id: 'default-tenant', // Using default tenant
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  console.log('✅ Created admin user:', adminUser.email);

  // Create test company
  const existingCompany = await prisma.company.findFirst({
    where: {
      tenant_id: 'default-tenant',
      name: 'Fiskario Test Company'
    },
  });

  let testCompany;
  if (existingCompany) {
    testCompany = existingCompany;
  } else {
    testCompany = await prisma.company.create({
      data: {
        tenant_id: 'default-tenant',
        name: 'Fiskario Test Company',
        nip: '1234567890',
        address: 'Test Street 123, 00-001 Warsaw, Poland',
      },
    });
  }

  console.log('✅ Created test company:', testCompany.name);

  // Create sample invoices
  const sampleInvoices = [
    {
      number: 'INV/2024/001',
      series: 'INV/2024',
      date: new Date('2024-01-15'),
      dueDate: new Date('2024-02-15'),
      buyerName: 'Test Customer 1',
      totalNet: 1000.00,
      totalVat: 230.00,
      totalGross: 1230.00,
      status: 'issued',
      company_id: testCompany.id,
      tenant_id: testCompany.tenant_id,
    },
    {
      number: 'INV/2024/002',
      series: 'INV/2024',
      date: new Date('2024-02-01'),
      dueDate: new Date('2024-03-01'),
      buyerName: 'Test Customer 2',
      totalNet: 2000.00,
      totalVat: 460.00,
      totalGross: 2460.00,
      status: 'issued',
      company_id: testCompany.id,
      tenant_id: testCompany.tenant_id,
    },
  ];

  for (const invoiceData of sampleInvoices) {
    const invoice = await prisma.invoice.create({
      data: {
        ...invoiceData,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`✅ Created invoice: ${invoice.number} - ${invoice.totalGross} PLN`);
  }

  // Create sample ZUS contributions
  const zusContributions = [
    {
      period: '2024-01',
      contributionDate: new Date('2024-01-31'),
      emerytalnaEmployer: 488.16,
      emerytalnaEmployee: 488.16,
      rentowaEmployer: 325.44,
      rentowaEmployee: 75.00,
      chorobowaEmployee: 22.45,
      zdrowotnaEmployee: 270.00,
      status: 'calculated',
      company_id: testCompany.id,
      tenant_id: testCompany.tenant_id,
    },
    {
      period: '2024-02',
      contributionDate: new Date('2024-02-29'),
      emerytalnaEmployer: 500.00,
      emerytalnaEmployee: 500.00,
      rentowaEmployer: 333.33,
      rentowaEmployee: 76.67,
      chorobowaEmployee: 22.95,
      zdrowotnaEmployee: 275.00,
      status: 'calculated',
      company_id: testCompany.id,
      tenant_id: testCompany.tenant_id,
    },
  ];

  for (const zusData of zusContributions) {
    const zus = await prisma.zUSContribution.create({
      data: {
        ...zusData,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`✅ Created ZUS contribution: ${zus.period} - Total: ${zus.emerytalnaEmployer + zus.emerytalnaEmployee + zus.rentowaEmployer + zus.rentowaEmployee + zus.chorobowaEmployee + zus.zdrowotnaEmployee} PLN`);
  }

  // Create sample tax declarations
  const taxDeclarations = [
    {
      type: 'VAT-7',
      period: '2024-01',
      data: { totalRevenue: 10000, vatDue: 2300 },
      status: 'submitted',
      company_id: testCompany.id,
      tenant_id: testCompany.tenant_id,
    },
    {
      type: 'PIT-36',
      period: '2023',
      data: { taxableIncome: 50000, taxDue: 8500 },
      status: 'submitted',
      company_id: testCompany.id,
      tenant_id: testCompany.tenant_id,
    },
  ];

  for (const declarationData of taxDeclarations) {
    const declaration = await prisma.declaration.create({
      data: {
        ...declarationData,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`✅ Created declaration: ${declaration.type} for ${declaration.period}`);
  }

  // Create sample employees
  const sampleEmployees = [
    {
      firstName: 'Jan',
      lastName: 'Kowalski',
      pesel: '85010112345',
      birthDate: new Date('1985-01-01'),
      address: 'Warsaw, Poland',
      employmentDate: new Date('2023-01-01'),
      insuranceStartDate: new Date('2023-01-01'),
      contractType: 'employment',
      salaryBasis: 5000.00,
      tenant_id: testCompany.tenant_id,
      company_id: testCompany.id,
    },
    {
      firstName: 'Anna',
      lastName: 'Nowak',
      pesel: '90020223456',
      birthDate: new Date('1990-02-02'),
      address: 'Krakow, Poland',
      employmentDate: new Date('2023-06-01'),
      insuranceStartDate: new Date('2023-06-01'),
      contractType: 'employment',
      salaryBasis: 4500.00,
      tenant_id: testCompany.tenant_id,
      company_id: testCompany.id,
    },
  ];

  const createdEmployees: any[] = [];
  for (const employeeData of sampleEmployees) {
    const employee = await prisma.zUSEmployee.create({
      data: {
        ...employeeData,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    createdEmployees.push(employee);
    console.log(`✅ Created employee: ${employee.firstName} ${employee.lastName}`);
  }

  // Create sample ZUS registrations
  const sampleRegistrations = [
    {
      employee_id: createdEmployees[0].id,
      formType: 'ZUA',
      registrationDate: new Date('2023-01-15'),
      insuranceTypes: {
        emerytalna: true,
        rentowa: true,
        chorobowa: true,
        wypadkowa: true,
        zdrowotna: true,
      },
      contributionBasis: 5000.00,
      data: {
        formType: 'ZUA',
        registrationDate: new Date('2023-01-15'),
        employee: {
          firstName: 'Jan',
          lastName: 'Kowalski',
          pesel: '85010112345',
          address: 'Warsaw, Poland',
        },
        insuranceTypes: {
          emerytalna: true,
          rentowa: true,
          chorobowa: true,
          wypadkowa: true,
          zdrowotna: true,
        },
        contributionBasis: 5000.00,
        company: {
          name: 'Fiskario Test Company',
          nip: '1234567890',
          address: 'Test Street 123, 00-001 Warsaw, Poland',
        },
      },
      tenant_id: testCompany.tenant_id,
      company_id: testCompany.id,
    },
    {
      employee_id: createdEmployees[1].id,
      formType: 'ZUA',
      registrationDate: new Date('2023-06-15'),
      insuranceTypes: {
        emerytalna: true,
        rentowa: true,
        chorobowa: true,
        wypadkowa: true,
        zdrowotna: true,
      },
      contributionBasis: 4500.00,
      data: {
        formType: 'ZUA',
        registrationDate: new Date('2023-06-15'),
        employee: {
          firstName: 'Anna',
          lastName: 'Nowak',
          pesel: '90020223456',
          address: 'Krakow, Poland',
        },
        insuranceTypes: {
          emerytalna: true,
          rentowa: true,
          chorobowa: true,
          wypadkowa: true,
          zdrowotna: true,
        },
        contributionBasis: 4500.00,
        company: {
          name: 'Fiskario Test Company',
          nip: '1234567890',
          address: 'Test Street 123, 00-001 Warsaw, Poland',
        },
      },
      tenant_id: testCompany.tenant_id,
      company_id: testCompany.id,
    },
  ];

  for (const registrationData of sampleRegistrations) {
    const registration = await prisma.zUSRegistration.create({
      data: {
        ...registrationData,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`✅ Created ZUS registration: ${registration.formType} for ${registration.employee_id}`);
  }

  // Create sample notifications
  const notifications = [
    {
      title: 'Tax Declaration Due Soon',
      body: 'Your VAT-7 declaration for February 2024 is due in 5 days.',
      type: 'deadline',
      priority: 'high',
      user_id: adminUser.id,
      tenant_id: testCompany.tenant_id,
    },
    {
      title: 'ZUS Contribution Due',
      body: 'Your social insurance contribution for February 2024 is due on March 15th.',
      type: 'deadline',
      priority: 'high',
      user_id: adminUser.id,
      tenant_id: testCompany.tenant_id,
    },
  ];

  for (const notificationData of notifications) {
    const notification = await prisma.notification.create({
      data: {
        ...notificationData,
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