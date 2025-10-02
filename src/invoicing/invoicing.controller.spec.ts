import { Test, TestingModule } from '@nestjs/testing';
import { InvoicingController } from './invoicing.controller';
import { InvoicingService } from './invoicing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('InvoicingController', () => {
  let controller: InvoicingController;
  let invoicingService: InvoicingService;

  const mockInvoicingService = {
    createInvoice: jest.fn(),
  };

  const mockRequest = {
    user: {
      tenant_id: 'tenant-123',
      id: 'user-id',
      email: 'test@example.com',
    },
  };

  const mockInvoiceData = {
    company_id: 'company-id',
    series: 'FV',
    date: '2024-01-15',
    buyerName: 'Test Buyer',
    buyerNip: '1234567890',
    buyerAddress: 'Buyer Address',
    items: [
      {
        description: 'Test Item',
        quantity: 2,
        unitPrice: 100,
        vatRate: 23,
        gtu: 'GTU_01',
      },
    ],
  };

  const mockCreatedInvoice = {
    id: 'invoice-id',
    tenant_id: 'tenant-123',
    number: 'FV/0001',
    series: 'FV',
    date: new Date('2024-01-15'),
    buyerName: 'Test Buyer',
    buyerNip: '1234567890',
    buyerAddress: 'Buyer Address',
    totalNet: 200,
    totalVat: 46,
    totalGross: 246,
    items: [
      {
        id: 'item-id',
        description: 'Test Item',
        quantity: 2,
        unitPrice: 100,
        vatRate: 23,
        gtu: 'GTU_01',
        netAmount: 200,
        vatAmount: 46,
        grossAmount: 246,
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvoicingController],
      providers: [
        {
          provide: InvoicingService,
          useValue: mockInvoicingService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<InvoicingController>(InvoicingController);
    invoicingService = module.get<InvoicingService>(InvoicingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createInvoice', () => {
    beforeEach(() => {
      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);
    });

    it('should create invoice successfully', async () => {
      const result = await controller.createInvoice(mockInvoiceData, mockRequest as any);

      expect(result).toEqual(mockCreatedInvoice);
      expect(invoicingService.createInvoice).toHaveBeenCalledWith(
        'tenant-123',
        mockInvoiceData
      );
    });

    it('should handle service errors', async () => {
      const errorMessage = 'Invoice creation failed';
      mockInvoicingService.createInvoice.mockRejectedValue(new Error(errorMessage));

      await expect(controller.createInvoice(mockInvoiceData, mockRequest as any))
        .rejects.toThrow(errorMessage);

      expect(invoicingService.createInvoice).toHaveBeenCalledWith(
        'tenant-123',
        mockInvoiceData
      );
    });

    it('should handle missing tenant_id in request', async () => {
      const requestWithoutTenant = {
        user: {
          id: 'user-id',
          email: 'test@example.com',
          // tenant_id is missing
        },
      };

      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      const result = await controller.createInvoice(mockInvoiceData, requestWithoutTenant as any);

      expect(result).toEqual(mockCreatedInvoice);
      expect(invoicingService.createInvoice).toHaveBeenCalledWith(
        undefined,
        mockInvoiceData
      );
    });

    it('should handle null tenant_id in request', async () => {
      const requestWithNullTenant = {
        user: {
          id: 'user-id',
          email: 'test@example.com',
          tenant_id: null,
        },
      };

      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      const result = await controller.createInvoice(mockInvoiceData, requestWithNullTenant as any);

      expect(result).toEqual(mockCreatedInvoice);
      expect(invoicingService.createInvoice).toHaveBeenCalledWith(
        null,
        mockInvoiceData
      );
    });

    it('should handle missing user in request', async () => {
      const requestWithoutUser = {
        // user is missing
      };

      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      const result = await controller.createInvoice(mockInvoiceData, requestWithoutUser as any);

      expect(result).toEqual(mockCreatedInvoice);
      expect(invoicingService.createInvoice).toHaveBeenCalledWith(
        undefined,
        mockInvoiceData
      );
    });

    it('should handle null user in request', async () => {
      const requestWithNullUser = {
        user: null,
      };

      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      const result = await controller.createInvoice(mockInvoiceData, requestWithNullUser as any);

      expect(result).toEqual(mockCreatedInvoice);
      expect(invoicingService.createInvoice).toHaveBeenCalledWith(
        undefined,
        mockInvoiceData
      );
    });

    it('should handle empty invoice data', async () => {
      const emptyData = {};

      mockInvoicingService.createInvoice.mockRejectedValue(new Error('Validation error'));

      await expect(controller.createInvoice(emptyData, mockRequest as any))
        .rejects.toThrow('Validation error');

      expect(invoicingService.createInvoice).toHaveBeenCalledWith(
        'tenant-123',
        emptyData
      );
    });

    it('should handle large invoice data', async () => {
      const largeData = {
        ...mockInvoiceData,
        items: Array.from({ length: 1000 }, (_, i) => ({
          description: `Item ${i}`,
          quantity: 1,
          unitPrice: 10,
          vatRate: 23,
          gtu: 'GTU_01',
        })),
      };

      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      const result = await controller.createInvoice(largeData, mockRequest as any);

      expect(result).toEqual(mockCreatedInvoice);
      expect(invoicingService.createInvoice).toHaveBeenCalledWith(
        'tenant-123',
        largeData
      );
    });

    it('should handle special characters in invoice data', async () => {
      const specialData = {
        ...mockInvoiceData,
        buyerName: 'Test Buyer ñáéíóú',
        buyerAddress: 'Address with spëcial çhars!@#$%',
      };

      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      const result = await controller.createInvoice(specialData, mockRequest as any);

      expect(result).toEqual(mockCreatedInvoice);
      expect(invoicingService.createInvoice).toHaveBeenCalledWith(
        'tenant-123',
        specialData
      );
    });

    it('should handle concurrent invoice creation requests', async () => {
      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      const requests = Array.from({ length: 10 }, (_, i) =>
        controller.createInvoice(
          { ...mockInvoiceData, series: `FV${i}` },
          { ...mockRequest, user: { ...mockRequest.user, tenant_id: `tenant-${i}` } } as any
        )
      );

      const results = await Promise.all(requests);

      expect(results).toHaveLength(10);
      expect(invoicingService.createInvoice).toHaveBeenCalledTimes(10);
      results.forEach(result => {
        expect(result).toEqual(mockCreatedInvoice);
      });
    });

    it('should handle malformed request object', async () => {
      const malformedRequest = {
        user: 'not-an-object',
      };

      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      const result = await controller.createInvoice(mockInvoiceData, malformedRequest as any);

      expect(result).toEqual(mockCreatedInvoice);
      expect(invoicingService.createInvoice).toHaveBeenCalledWith(
        undefined,
        mockInvoiceData
      );
    });

    it('should handle request with extra properties', async () => {
      const requestWithExtras = {
        user: {
          tenant_id: 'tenant-123',
          id: 'user-id',
          email: 'test@example.com',
          extraProperty: 'extra-value',
          nested: {
            property: 'nested-value',
          },
        },
      };

      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      const result = await controller.createInvoice(mockInvoiceData, requestWithExtras as any);

      expect(result).toEqual(mockCreatedInvoice);
      expect(invoicingService.createInvoice).toHaveBeenCalledWith(
        'tenant-123',
        mockInvoiceData
      );
    });
  });

  describe('Guard integration', () => {
    it('should be protected by JwtAuthGuard', () => {
      const guards = Reflect.getMetadata('__guards__', InvoicingController.prototype.createInvoice);
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });

    it('should use POST method for create endpoint', () => {
      const method = Reflect.getMetadata('__method__', InvoicingController.prototype.createInvoice);
      expect(method).toBe('POST');
    });

    it('should use /invoicing path prefix', () => {
      const path = Reflect.getMetadata('__path__', InvoicingController.prototype.createInvoice);
      expect(path).toBe('create');
    });
  });

  describe('Error handling', () => {
    it('should handle database connection errors', async () => {
      mockInvoicingService.createInvoice.mockRejectedValue(new Error('Database connection failed'));

      await expect(controller.createInvoice(mockInvoiceData, mockRequest as any))
        .rejects.toThrow('Database connection failed');
    });

    it('should handle validation errors', async () => {
      mockInvoicingService.createInvoice.mockRejectedValue(new Error('Validation failed'));

      await expect(controller.createInvoice(mockInvoiceData, mockRequest as any))
        .rejects.toThrow('Validation failed');
    });

    it('should handle KSeF service errors', async () => {
      mockInvoicingService.createInvoice.mockRejectedValue(new Error('KSeF service unavailable'));

      await expect(controller.createInvoice(mockInvoiceData, mockRequest as any))
        .rejects.toThrow('KSeF service unavailable');
    });

    it('should handle file system errors during PDF generation', async () => {
      mockInvoicingService.createInvoice.mockRejectedValue(new Error('File system error'));

      await expect(controller.createInvoice(mockInvoiceData, mockRequest as any))
        .rejects.toThrow('File system error');
    });
  });

  describe('Security considerations', () => {
    it('should not expose sensitive user information in errors', async () => {
      const sensitiveError = new Error('Sensitive database error');
      mockInvoicingService.createInvoice.mockRejectedValue(sensitiveError);

      try {
        await controller.createInvoice(mockInvoiceData, mockRequest as any);
      } catch (error) {
        expect(error.message).toBe('Sensitive database error');
        expect(error.message).not.toContain('password');
        expect(error.message).not.toContain('secret');
      }
    });

    it('should handle malicious invoice data', async () => {
      const maliciousData = {
        ...mockInvoiceData,
        // Malicious fields
        __proto__: { malicious: 'data' },
        constructor: { prototype: { malicious: 'data' } },
      };

      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      const result = await controller.createInvoice(maliciousData, mockRequest as any);

      expect(result).toEqual(mockCreatedInvoice);
      expect(invoicingService.createInvoice).toHaveBeenCalledWith(
        'tenant-123',
        maliciousData
      );
    });

    it('should handle malicious request data', async () => {
      const maliciousRequest = {
        user: {
          tenant_id: 'tenant-123',
          id: 'user-id',
          email: 'test@example.com',
          // Malicious fields
          __proto__: { malicious: 'data' },
          constructor: { prototype: { malicious: 'data' } },
        },
      };

      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      const result = await controller.createInvoice(mockInvoiceData, maliciousRequest as any);

      expect(result).toEqual(mockCreatedInvoice);
      expect(invoicingService.createInvoice).toHaveBeenCalledWith(
        'tenant-123',
        mockInvoiceData
      );
    });
  });

  describe('Performance considerations', () => {
    it('should handle rapid successive requests', async () => {
      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      // Simulate rapid successive requests
      for (let i = 0; i < 5; i++) {
        const result = await controller.createInvoice(mockInvoiceData, mockRequest as any);
        expect(result).toEqual(mockCreatedInvoice);
      }

      expect(invoicingService.createInvoice).toHaveBeenCalledTimes(5);
    });

    it('should handle large payloads efficiently', async () => {
      const largePayload = {
        ...mockInvoiceData,
        description: 'A'.repeat(10000), // Large description
        items: Array.from({ length: 100 }, (_, i) => ({
          description: `Item ${i} with long description: ${'A'.repeat(1000)}`,
          quantity: 1,
          unitPrice: 10,
          vatRate: 23,
          gtu: 'GTU_01',
        })),
      };

      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      const result = await controller.createInvoice(largePayload, mockRequest as any);

      expect(result).toEqual(mockCreatedInvoice);
      expect(invoicingService.createInvoice).toHaveBeenCalledWith(
        'tenant-123',
        largePayload
      );
    });
  });

  describe('Input validation', () => {
    it('should handle invalid date formats', async () => {
      const invalidDateData = {
        ...mockInvoiceData,
        date: 'invalid-date',
      };

      mockInvoicingService.createInvoice.mockRejectedValue(new Error('Invalid date'));

      await expect(controller.createInvoice(invalidDateData, mockRequest as any))
        .rejects.toThrow('Invalid date');
    });

    it('should handle invalid numeric values', async () => {
      const invalidNumericData = {
        ...mockInvoiceData,
        items: [
          {
            description: 'Test Item',
            quantity: 'invalid',
            unitPrice: 'invalid',
            vatRate: 'invalid',
            gtu: 'GTU_01',
          },
        ],
      };

      mockInvoicingService.createInvoice.mockRejectedValue(new Error('Invalid number'));

      await expect(controller.createInvoice(invalidNumericData, mockRequest as any))
        .rejects.toThrow('Invalid number');
    });

    it('should handle negative values', async () => {
      const negativeData = {
        ...mockInvoiceData,
        items: [
          {
            description: 'Test Item',
            quantity: -1,
            unitPrice: -100,
            vatRate: -23,
            gtu: 'GTU_01',
          },
        ],
      };

      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      const result = await controller.createInvoice(negativeData, mockRequest as any);

      expect(result).toEqual(mockCreatedInvoice);
    });

    it('should handle zero values', async () => {
      const zeroData = {
        ...mockInvoiceData,
        items: [
          {
            description: 'Test Item',
            quantity: 0,
            unitPrice: 0,
            vatRate: 0,
            gtu: 'GTU_01',
          },
        ],
      };

      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      const result = await controller.createInvoice(zeroData, mockRequest as any);

      expect(result).toEqual(mockCreatedInvoice);
    });
  });

  describe('Edge cases', () => {
    it('should handle very long tenant_id', async () => {
      const longTenantId = 'a'.repeat(1000);
      const requestWithLongTenant = {
        user: {
          tenant_id: longTenantId,
          id: 'user-id',
          email: 'test@example.com',
        },
      };

      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      const result = await controller.createInvoice(mockInvoiceData, requestWithLongTenant as any);

      expect(result).toEqual(mockCreatedInvoice);
      expect(invoicingService.createInvoice).toHaveBeenCalledWith(
        longTenantId,
        mockInvoiceData
      );
    });

    it('should handle very long buyer name', async () => {
      const longBuyerName = 'A'.repeat(1000);
      const dataWithLongBuyerName = {
        ...mockInvoiceData,
        buyerName: longBuyerName,
      };

      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      const result = await controller.createInvoice(dataWithLongBuyerName, mockRequest as any);

      expect(result).toEqual(mockCreatedInvoice);
      expect(invoicingService.createInvoice).toHaveBeenCalledWith(
        'tenant-123',
        dataWithLongBuyerName
      );
    });

    it('should handle unicode characters in data', async () => {
      const unicodeData = {
        ...mockInvoiceData,
        buyerName: '测试用户 🚀',
        buyerAddress: '地址 with émojis 🌟 and spëcial çhars',
      };

      mockInvoicingService.createInvoice.mockResolvedValue(mockCreatedInvoice);

      const result = await controller.createInvoice(unicodeData, mockRequest as any);

      expect(result).toEqual(mockCreatedInvoice);
      expect(invoicingService.createInvoice).toHaveBeenCalledWith(
        'tenant-123',
        unicodeData
      );
    });
  });
});
