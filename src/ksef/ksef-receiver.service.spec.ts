import { Test, TestingModule } from '@nestjs/testing';
import { KsefReceiverService } from './ksef-receiver.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { KsefService } from './ksef.service';
import { KSeFEnvironment } from './dto/ksef-auth.dto';

describe('KsefReceiverService', () => {
    let service: KsefReceiverService;
    let prismaService: PrismaService;
    let ksefService: KsefService;

    const mockPrismaService = {
        invoice: {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        buyer: {
            findFirst: jest.fn(),
            create: jest.fn(),
        },
    };

    const mockKsefService = {
        getAuthStatus: jest.fn(),
    };

    const mockConfigService = {
        get: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                KsefReceiverService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
                {
                    provide: KsefService,
                    useValue: mockKsefService,
                },
                {
                    provide: ConfigService,
                    useValue: mockConfigService,
                },
            ],
        }).compile();

        service = module.get<KsefReceiverService>(KsefReceiverService);
        prismaService = module.get<PrismaService>(PrismaService);
        ksefService = module.get<KsefService>(KsefService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('parseFA3Invoice', () => {
        it('should parse valid FA(3) XML correctly', async () => {
            const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<FA xmlns="http://ksef.mf.gov.pl/schema/fa/3">
  <Naglowek>
    <KodFormularza>FA (3)</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>2026-01-31</DataWytworzeniaFa>
    <KodSystemowy>TEST</KodSystemowy>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>1234567890</NIP>
      <Nazwa>Test Seller Sp. z o.o.</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <AdresL1>ul. Testowa 1</AdresL1>
      <Miejscowosc>Warszawa</Miejscowosc>
      <KodPocztowy>00-001</KodPocztowy>
      <KodKraju>PL</KodKraju>
    </Adres>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <NIP>0987654321</NIP>
      <Nazwa>Test Buyer Sp. z o.o.</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <AdresL1>ul. Kupiecka 2</AdresL1>
      <Miejscowosc>Kraków</Miejscowosc>
      <KodPocztowy>30-001</KodPocztowy>
      <KodKraju>PL</KodKraju>
    </Adres>
  </Podmiot2>
  <Faktura>
    <NumerFa>FV/2026/001</NumerFa>
    <DataWystawienia>2026-01-31</DataWystawienia>
    <DataSprzedazy>2026-01-30</DataSprzedazy>
    <TerminPlatnosci>2026-02-14</TerminPlatnosci>
    <SposobPlatnosci>przelew</SposobPlatnosci>
    <KodWaluty>PLN</KodWaluty>
    <Wartosci>
      <WartoscNetto>1000.00</WartoscNetto>
      <WartoscVat>230.00</WartoscVat>
      <WartoscBrutto>1230.00</WartoscBrutto>
    </Wartosci>
    <Pozycje>
      <Pozycja>
        <Lp>1</Lp>
        <Nazwa>Produkt testowy</Nazwa>
        <Ilosc>10.00</Ilosc>
        <Jednostka>szt</Jednostka>
        <CenaJednostkowa>100.00</CenaJednostkowa>
        <WartoscNetto>1000.00</WartoscNetto>
        <StawkaVat>23</StawkaVat>
        <WartoscVat>230.00</WartoscVat>
        <WartoscBrutto>1230.00</WartoscBrutto>
      </Pozycja>
    </Pozycje>
  </Faktura>
</FA>`;

            const result = await service.parseFA3Invoice(xmlContent, 'TEST-123');

            expect(result).toBeDefined();
            expect(result.ksefNumber).toBe('TEST-123');
            expect(result.invoiceNumber).toBe('FV/2026/001');
            expect(result.sellerNip).toBe('1234567890');
            expect(result.sellerName).toBe('Test Seller Sp. z o.o.');
            expect(result.buyerNip).toBe('0987654321');
            expect(result.totalNet).toBe(1000);
            expect(result.totalVat).toBe(230);
            expect(result.totalGross).toBe(1230);
            expect(result.items).toHaveLength(1);
            expect(result.items[0].name).toBe('Produkt testowy');
        });

        it('should throw error for invalid XML', async () => {
            const invalidXml = '<invalid>xml</invalid>';

            await expect(
                service.parseFA3Invoice(invalidXml, 'TEST-123'),
            ).rejects.toThrow();
        });
    });

    describe('saveReceivedInvoice', () => {
        it('should save new invoice and create buyer if not exists', async () => {
            const invoiceDto = {
                ksefNumber: 'KSEF-123',
                ksefReferenceNumber: 'REF-123',
                invoiceNumber: 'FV/2026/001',
                issueDate: '2026-01-31',
                sellerNip: '1234567890',
                sellerName: 'Test Seller',
                sellerAddress: 'ul. Testowa 1',
                buyerNip: '0987654321',
                buyerName: 'Test Buyer',
                buyerAddress: 'ul. Kupiecka 2',
                totalNet: 1000,
                totalVat: 230,
                totalGross: 1230,
                items: [
                    {
                        lineNumber: 1,
                        name: 'Product',
                        quantity: 1,
                        unit: 'szt',
                        unitPrice: 1000,
                        netAmount: 1000,
                        vatRate: 23,
                        vatAmount: 230,
                        grossAmount: 1230,
                    },
                ],
                xmlContent: '<xml>content</xml>',
            };

            mockPrismaService.invoice.findFirst.mockResolvedValue(null);
            mockPrismaService.buyer.findFirst.mockResolvedValue(null);
            mockPrismaService.buyer.create.mockResolvedValue({ id: 'buyer-1' });
            mockPrismaService.invoice.create.mockResolvedValue({ id: 'invoice-1' });

            const result = await service.saveReceivedInvoice(
                invoiceDto as any,
                'tenant-1',
                'company-1',
            );

            expect(result).toBe('invoice-1');
            expect(mockPrismaService.buyer.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        nip: '1234567890',
                        name: 'Test Seller',
                    }),
                }),
            );
            expect(mockPrismaService.invoice.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        receivedFromKsef: true,
                        isIncoming: true,
                        ksefInvoiceNumber: 'KSEF-123',
                        approvalStatus: 'pending',
                    }),
                }),
            );
        });

        it('should skip duplicate invoices', async () => {
            const invoiceDto = {
                ksefNumber: 'KSEF-123',
            } as any;

            mockPrismaService.invoice.findFirst.mockResolvedValue({ id: 'existing-invoice' });

            const result = await service.saveReceivedInvoice(invoiceDto, 'tenant-1', 'company-1');

            expect(result).toBe('existing-invoice');
            expect(mockPrismaService.invoice.create).not.toHaveBeenCalled();
        });
    });

    describe('approveInvoice', () => {
        it('should approve invoice successfully', async () => {
            mockPrismaService.invoice.update.mockResolvedValue({ id: 'invoice-1' });

            await service.approveInvoice('invoice-1', 'tenant-1', 'user-1', 'Approved');

            expect(mockPrismaService.invoice.update).toHaveBeenCalledWith({
                where: {
                    id: 'invoice-1',
                    tenant_id: 'tenant-1',
                    receivedFromKsef: true,
                },
                data: expect.objectContaining({
                    approvalStatus: 'approved',
                    approvedBy: 'user-1',
                    approvalNotes: 'Approved',
                }),
            });
        });
    });

    describe('rejectInvoice', () => {
        it('should reject invoice with reason', async () => {
            mockPrismaService.invoice.update.mockResolvedValue({ id: 'invoice-1' });

            await service.rejectInvoice('invoice-1', 'tenant-1', 'user-1', 'Invalid data');

            expect(mockPrismaService.invoice.update).toHaveBeenCalledWith({
                where: {
                    id: 'invoice-1',
                    tenant_id: 'tenant-1',
                    receivedFromKsef: true,
                },
                data: expect.objectContaining({
                    approvalStatus: 'rejected',
                    approvedBy: 'user-1',
                    rejectionReason: 'Invalid data',
                }),
            });
        });
    });
});
