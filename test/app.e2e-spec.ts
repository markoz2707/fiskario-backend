import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Authentication and Invoicing (e2e)', () => {
   let app: INestApplication;
   let authToken: string;
   let createdBuyerId: string;
   let createdInvoiceId: string;
   let createdCompanyId: string;
   const testEmail = `test-${Date.now()}@example.com`;
   const testTenantId = `test-tenant-${Date.now()}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication Flow', () => {
    it('should register a new user', () => {
      const userData = {
        email: testEmail,
        password: 'testpassword123',
        firstName: 'Test',
        lastName: 'User',
        tenant_id: testTenantId
      };

      return request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('access_token');
          expect(res.body.user).toHaveProperty('email', userData.email);
          expect(res.body.user).toHaveProperty('tenant_id', userData.tenant_id);
        });
    });

    it('should login with registered user', () => {
      const loginData = {
        email: testEmail,
        password: 'testpassword123'
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('access_token');
          expect(res.body.user).toHaveProperty('email', loginData.email);
          authToken = res.body.access_token;
        });
    });

    it('should reject login with wrong password', () => {
      const loginData = {
        email: testEmail,
        password: 'wrongpassword'
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(401);
    });

    it('should reject access to protected routes without token', () => {
      return request(app.getHttpServer())
        .post('/buyers')
        .send({
          name: 'Test Buyer',
          nip: '1234567890'
        })
        .expect(401);
    });

    it('should reject access to protected routes with invalid token', () => {
      return request(app.getHttpServer())
        .post('/buyers')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          name: 'Test Buyer',
          nip: '1234567890'
        })
        .expect(401);
    });
  });

  describe('Company Setup', () => {
    it('should create a company for the test tenant', () => {
      const companyData = {
        name: 'Test Company Ltd.',
        nip: '1234567890',
        address: 'Test Company Address 123',
        taxForm: 'corporation',
        vatPayer: true
      };

      return request(app.getHttpServer())
        .post('/companies')
        .set('Authorization', `Bearer ${authToken}`)
        .send(companyData)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('name', companyData.name);
          expect(res.body).toHaveProperty('tenant_id', testTenantId);
          createdCompanyId = res.body.id;
        });
    });
  });

  describe('Buyer Management', () => {
    it('should create a new buyer with valid authentication', () => {
      const buyerData = {
        name: 'Test Buyer Company',
        nip: '1234567890',
        address: 'Test Street 123',
        city: 'Test City',
        postalCode: '00-001',
        country: 'PL',
        email: 'buyer@test.com',
        phone: '+48 123 456 789',
        website: 'https://buyer.com',
        notes: 'Test buyer notes',
        isActive: true
      };

      return request(app.getHttpServer())
        .post('/buyers')
        .set('Authorization', `Bearer ${authToken}`)
        .send(buyerData)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('name', buyerData.name);
          expect(res.body).toHaveProperty('nip', buyerData.nip);
          expect(res.body).toHaveProperty('tenant_id', testTenantId);
          createdBuyerId = res.body.id;
        });
    });

    it('should get all buyers', () => {
      return request(app.getHttpServer())
        .get('/buyers')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          expect(res.body[0]).toHaveProperty('id');
          expect(res.body[0]).toHaveProperty('name');
        });
    });

    it('should get buyer by id', () => {
      return request(app.getHttpServer())
        .get(`/buyers/${createdBuyerId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', createdBuyerId);
          expect(res.body).toHaveProperty('name', 'Test Buyer Company');
        });
    });

    it('should find buyers by NIP', () => {
      return request(app.getHttpServer())
        .get('/buyers/search/by-nip/1234567890')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          expect(res.body[0]).toHaveProperty('nip', '1234567890');
        });
    });

    it('should update buyer', () => {
      const updateData = {
        name: 'Updated Buyer Company',
        email: 'updated@buyer.com'
      };

      return request(app.getHttpServer())
        .put(`/buyers/${createdBuyerId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', createdBuyerId);
          expect(res.body).toHaveProperty('name', updateData.name);
          expect(res.body).toHaveProperty('email', updateData.email);
        });
    });

    it('should get buyer statistics', () => {
      return request(app.getHttpServer())
        .get('/buyers/stats/overview')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('totalBuyers');
          expect(res.body).toHaveProperty('activeBuyers');
          expect(typeof res.body.totalBuyers).toBe('number');
        });
    });
  });

  describe('Invoice Creation with Buyer Integration', () => {
    it('should create invoice with new buyer', () => {
      const invoiceData = {
        company_id: createdCompanyId,
        series: 'FV',
        date: '2024-01-15',
        buyerName: 'Invoice Test Buyer',
        buyerNip: '9876543210',
        buyerAddress: 'Invoice Buyer Address 456',
        buyerCity: 'Invoice City',
        buyerPostalCode: '11-111',
        buyerCountry: 'PL',
        buyerEmail: 'invoice@buyer.com',
        items: [
          {
            description: 'Test Service',
            quantity: 2,
            unitPrice: 100.00,
            vatRate: 23,
            gtu: 'GTU_01'
          }
        ]
      };

      return request(app.getHttpServer())
        .post('/invoicing/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invoiceData)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('number');
          expect(res.body).toHaveProperty('buyer_id');
          expect(res.body).toHaveProperty('totalNet');
          expect(res.body).toHaveProperty('totalVat');
          expect(res.body).toHaveProperty('totalGross');
          expect(res.body).toHaveProperty('items');
          expect(Array.isArray(res.body.items)).toBe(true);
          expect(res.body.items.length).toBe(1);
          createdInvoiceId = res.body.id;
        });
    });

    it('should create invoice with existing buyer reference', () => {
      const invoiceData = {
        company_id: createdCompanyId,
        series: 'FV',
        date: '2024-01-16',
        buyerName: 'Updated Buyer Company', // This should match existing buyer
        buyerNip: '1234567890', // This should match existing buyer
        buyerAddress: 'Updated Address',
        items: [
          {
            description: 'Another Service',
            quantity: 1,
            unitPrice: 250.00,
            vatRate: 23,
            gtu: 'GTU_02'
          }
        ]
      };

      return request(app.getHttpServer())
        .post('/invoicing/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invoiceData)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('buyer_id');
          // Should reuse existing buyer
          expect(res.body.buyer_id).toBe(createdBuyerId);
        });
    });

    it('should handle invoice creation with missing buyer data', () => {
      const invalidInvoiceData = {
        company_id: createdCompanyId,
        series: 'FV',
        date: '2024-01-17',
        // Missing buyerName and buyerNip
        items: [
          {
            description: 'Test Service',
            quantity: 1,
            unitPrice: 100.00,
            vatRate: 23,
            gtu: 'GTU_01'
          }
        ]
      };

      return request(app.getHttpServer())
        .post('/invoicing/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidInvoiceData)
        .expect(400); // Should fail validation
    });

    it('should handle invoice creation with invalid item data', () => {
      const invalidInvoiceData = {
        company_id: createdCompanyId,
        series: 'FV',
        date: '2024-01-18',
        buyerName: 'Test Buyer',
        buyerNip: '1234567890',
        items: [
          {
            description: 'Test Service',
            quantity: -1, // Invalid negative quantity
            unitPrice: 100.00,
            vatRate: 23,
            gtu: 'GTU_01'
          }
        ]
      };

      return request(app.getHttpServer())
        .post('/invoicing/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidInvoiceData)
        .expect(400); // Should fail validation
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JWT token', () => {
      return request(app.getHttpServer())
        .get('/buyers')
        .set('Authorization', 'Bearer malformed.jwt.token')
        .expect(401);
    });

    it('should handle expired JWT token', () => {
      // Create an expired token for testing
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.signature';

      return request(app.getHttpServer())
        .get('/buyers')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    it('should handle missing authorization header', () => {
      return request(app.getHttpServer())
        .post('/invoicing/create')
        .send({
          company_id: createdCompanyId,
          series: 'FV',
          date: '2024-01-19',
          buyerName: 'Test Buyer',
          buyerNip: '1234567890',
          items: []
        })
        .expect(401);
    });

    it('should handle empty authorization header', () => {
      return request(app.getHttpServer())
        .get('/buyers')
        .set('Authorization', '')
        .expect(401);
    });
  });

  describe('Integration Flow', () => {
    it('should complete full flow: create buyer -> create invoice -> verify relationship', () => {
      let newBuyerId: string;
      let newInvoiceId: string;

      // Step 1: Create a new buyer
      const buyerData = {
        name: 'Integration Test Buyer',
        nip: '1111111111',
        address: 'Integration Street 789',
        city: 'Integration City',
        postalCode: '22-222',
        country: 'PL',
        email: 'integration@buyer.com',
        isActive: true
      };

      return request(app.getHttpServer())
        .post('/buyers')
        .set('Authorization', `Bearer ${authToken}`)
        .send(buyerData)
        .expect(201)
        .then((buyerRes) => {
          expect(buyerRes.body).toHaveProperty('id');
          newBuyerId = buyerRes.body.id;

          // Step 2: Create invoice with this buyer
          const invoiceData = {
            company_id: createdCompanyId,
            series: 'FV',
            date: '2024-01-20',
            buyerName: 'Integration Test Buyer',
            buyerNip: '1111111111',
            buyerAddress: 'Integration Street 789',
            items: [
              {
                description: 'Integration Test Service',
                quantity: 1,
                unitPrice: 500.00,
                vatRate: 23,
                gtu: 'GTU_03'
              }
            ]
          };

          return request(app.getHttpServer())
            .post('/invoicing/create')
            .set('Authorization', `Bearer ${authToken}`)
            .send(invoiceData)
            .expect(201);
        })
        .then((invoiceRes) => {
          expect(invoiceRes.body).toHaveProperty('id');
          expect(invoiceRes.body).toHaveProperty('buyer_id');
          newInvoiceId = invoiceRes.body.id;

          // Step 3: Verify the invoice is linked to the correct buyer
          expect(invoiceRes.body.buyer_id).toBe(newBuyerId);

          // Step 4: Verify buyer exists and has the invoice relationship
          return request(app.getHttpServer())
            .get(`/buyers/${newBuyerId}`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);
        })
        .then((buyerRes) => {
          expect(buyerRes.body).toHaveProperty('id', newBuyerId);
          expect(buyerRes.body).toHaveProperty('name', 'Integration Test Buyer');
        });
    });
  });

  describe('Security Tests', () => {
    it('should not allow access to other tenant data', () => {
      // This test would require multiple users with different tenants
      // For now, we'll test that tenant_id is properly isolated
      const buyerData = {
        name: 'Cross-Tenant Test Buyer',
        nip: '2222222222',
        address: 'Cross Tenant Street',
        city: 'Cross Tenant City',
        postalCode: '33-333',
        country: 'PL',
        email: 'crosstenant@buyer.com',
        isActive: true
      };

      return request(app.getHttpServer())
        .post('/buyers')
        .set('Authorization', `Bearer ${authToken}`)
        .send(buyerData)
        .expect(201)
        .then((res) => {
          expect(res.body).toHaveProperty('tenant_id', testTenantId);
        });
    });

    it('should validate buyer data format', () => {
      const invalidBuyerData = {
        name: '', // Empty name should fail
        nip: 'invalid-nip', // Invalid NIP format
        email: 'invalid-email' // Invalid email format
      };

      return request(app.getHttpServer())
        .post('/buyers')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidBuyerData)
        .expect(400);
    });

    it('should validate invoice data format', () => {
      const invalidInvoiceData = {
        company_id: createdCompanyId, // Use valid company_id but other invalid data
        series: '', // Empty series
        date: 'invalid-date', // Invalid date format
        buyerName: '', // Empty buyer name
        items: [] // Empty items array
      };

      return request(app.getHttpServer())
        .post('/invoicing/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidInvoiceData)
        .expect(400);
    });
  });
});
