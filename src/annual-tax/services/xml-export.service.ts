import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as xml2js from 'xml2js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * XML Export Service for Polish PIT declarations.
 *
 * Generates XML files conforming to Ministerstwo Finansow (MF) schema
 * for PIT-36, PIT-36L, and PIT-28 annual tax returns.
 *
 * Schema references:
 *  - PIT-36 (31): http://crd.gov.pl/wzor/2024/12/16/13798/
 *  - PIT-36L (20): http://crd.gov.pl/wzor/2024/12/16/13799/
 *  - PIT-28 (26): http://crd.gov.pl/wzor/2024/12/16/13800/
 */
@Injectable()
export class XMLExportService {
  private readonly logger = new Logger(XMLExportService.name);

  /** Directory for exported XML files */
  private readonly exportDir = path.resolve('./uploads/exports');

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // Main export method
  // ============================================================

  /**
   * Export an annual tax return to XML file.
   * Determines the correct form type and delegates to the appropriate generator.
   *
   * @param tenantId - Tenant ID for multi-tenancy isolation
   * @param returnId - ID of the AnnualTaxReturn to export
   * @returns Object containing the file path and download URL
   */
  async exportToFile(
    tenantId: string,
    returnId: string,
  ): Promise<{ filePath: string; downloadUrl: string; xmlContent: string }> {
    const taxReturn = await this.fetchReturnWithRelations(tenantId, returnId);

    // Only allow export of calculated returns
    if (taxReturn.status === 'DRAFT' || taxReturn.status === 'CALCULATING') {
      throw new BadRequestException(
        `Cannot export a ${taxReturn.status} return. Run calculation first.`,
      );
    }

    this.logger.log(
      `Exporting ${taxReturn.formType} XML for return ${returnId}, year ${taxReturn.year}`,
    );

    let xmlContent: string;

    switch (taxReturn.formType) {
      case 'PIT_36':
        xmlContent = await this.generatePIT36XML(tenantId, returnId);
        break;
      case 'PIT_36L':
        xmlContent = await this.generatePIT36LXML(tenantId, returnId);
        break;
      case 'PIT_28':
        xmlContent = await this.generatePIT28XML(tenantId, returnId);
        break;
      default:
        throw new BadRequestException(
          `Unsupported form type for XML export: ${taxReturn.formType}`,
        );
    }

    // Ensure export directory exists
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }

    const formTypeLower = taxReturn.formType.replace('_', '-').toLowerCase();
    const fileName = `pit-${formTypeLower}-${taxReturn.year}-${returnId}.xml`;
    const filePath = path.join(this.exportDir, fileName);

    fs.writeFileSync(filePath, xmlContent, 'utf-8');
    this.logger.log(`XML exported to ${filePath}`);

    // Store the XML content on the return record for later submission
    await this.prisma.annualTaxReturn.update({
      where: { id: returnId },
      data: { xmlContent },
    });

    return {
      filePath,
      downloadUrl: `/uploads/exports/${fileName}`,
      xmlContent,
    };
  }

  // ============================================================
  // PIT-36 XML Generator (skala podatkowa)
  // ============================================================

  /**
   * Generate PIT-36 XML conforming to MF schema version 31.
   *
   * PIT-36 is used for taxpayers who:
   * - Run a sole proprietorship (JDG) taxed on the progressive scale
   * - May also have employment income (PIT-11)
   * - May file jointly with a spouse
   */
  async generatePIT36XML(tenantId: string, returnId: string): Promise<string> {
    const taxReturn = await this.fetchReturnWithRelations(tenantId, returnId);
    const company = await this.fetchCompany(taxReturn.company_id);
    const deductions = taxReturn.deductions || [];

    // Separate deductions by category
    const deductionsFromIncome = deductions.filter(
      (d) => d.category === 'FROM_INCOME',
    );
    const deductionsFromTax = deductions.filter(
      (d) => d.category === 'FROM_TAX',
    );

    // Sum child relief deductions
    const childReliefTotal = deductionsFromTax
      .filter((d) => d.type === 'CHILD_RELIEF')
      .reduce((sum, d) => sum + d.amount, 0);

    const declaration = {
      Deklaracja: {
        $: {
          xmlns: 'http://crd.gov.pl/wzor/2024/12/16/13798/',
        },
        Naglowek: this.buildNaglowek('PIT_36', taxReturn.year),
        Podmiot1: this.buildPodmiot(company),
        PozycjeSzczegolowe: {
          // P_7: Forma rozliczenia (1 = indywidualnie, 2 = wspolnie z malzonkiem)
          P_7: taxReturn.jointFiling ? '2' : '1',
          // Dane identyfikacyjne podatnika
          P_20: company.name?.split(' ')[0] || '', // Imie (first word of company name as placeholder)
          P_21: company.name?.split(' ').slice(1).join(' ') || '', // Nazwisko
          P_22: '', // Data urodzenia - not stored in current schema
          // === Dzialnosc gospodarcza (JDG) ===
          P_38: this.formatAmount(taxReturn.businessIncome), // Przychod z JDG
          P_39: this.formatAmount(taxReturn.businessCosts), // Koszty uzyskania z JDG
          P_40: this.formatAmount(taxReturn.businessProfit), // Dochod z JDG
          // === Dochody z etatu (PIT-11) ===
          P_68: this.formatAmount(taxReturn.employmentIncome), // Przychod z etatu
          P_69: this.formatAmount(taxReturn.employmentCosts), // Koszty uzyskania z etatu
          P_70: this.formatAmount(taxReturn.employmentProfit), // Dochod z etatu
          // === Wspolne rozliczenie malzonkow ===
          ...(taxReturn.jointFiling && taxReturn.spouseIncome != null
            ? {
                P_82: this.formatAmount(taxReturn.spouseIncome), // Przychod malzonka
                P_83: this.formatAmount(taxReturn.spouseCosts || 0), // Koszty malzonka
                P_84: this.formatAmount(
                  (taxReturn.spouseIncome || 0) -
                    (taxReturn.spouseCosts || 0),
                ), // Dochod malzonka
                P_85: taxReturn.spousePesel || '', // PESEL malzonka
              }
            : {}),
          // === Podsumowanie ===
          P_116: this.formatAmount(taxReturn.totalIncome), // Dochod razem
          P_117: this.formatAmount(taxReturn.otherDeductions), // Odliczenia od dochodu (ZUS + inne)
          P_118: this.formatAmount(taxReturn.taxBase), // Podstawa obliczenia podatku
          P_119: this.formatAmount(taxReturn.taxCalculated), // Podatek obliczony wg skali
          // === Ulgi od podatku ===
          P_140: this.formatAmount(childReliefTotal), // Ulga na dzieci
          P_141: this.formatAmount(taxReturn.taxDue), // Podatek po odliczeniach
          // === Zaliczki i rozliczenie ===
          P_146: this.formatAmount(taxReturn.advancesPaid), // Zaliczki zaplacone (JDG + etat)
          P_147: this.formatAmount(taxReturn.finalAmount), // Do zaplaty (+) lub nadplata (-)
        },
        // === Zalacznik PIT/O - odliczenia ===
        ...(deductionsFromIncome.length > 0 || deductionsFromTax.length > 0
          ? {
              ZalacznikPIT_O: {
                OdliczeniaOdDochodu:
                  deductionsFromIncome.length > 0
                    ? {
                        Odliczenie: deductionsFromIncome.map((d) => ({
                          Typ: d.type,
                          Kwota: this.formatAmount(d.amount),
                          Opis: d.description,
                          ...(d.documentRef
                            ? { NrDokumentu: d.documentRef }
                            : {}),
                        })),
                      }
                    : undefined,
                OdliczeniaOdPodatku:
                  deductionsFromTax.length > 0
                    ? {
                        Odliczenie: deductionsFromTax.map((d) => ({
                          Typ: d.type,
                          Kwota: this.formatAmount(d.amount),
                          Opis: d.description,
                          ...(d.childName
                            ? { ImieDziecka: d.childName }
                            : {}),
                          ...(d.childPesel
                            ? { PeselDziecka: d.childPesel }
                            : {}),
                          ...(d.childMonths
                            ? { LiczbaMiesiecy: d.childMonths }
                            : {}),
                        })),
                      }
                    : undefined,
              },
            }
          : {}),
      },
    };

    return this.buildXML(declaration);
  }

  // ============================================================
  // PIT-36L XML Generator (podatek liniowy 19%)
  // ============================================================

  /**
   * Generate PIT-36L XML conforming to MF schema version 20.
   *
   * PIT-36L is used for taxpayers who chose the flat 19% tax rate
   * for their sole proprietorship income. Employment income is NOT
   * included (must be filed separately on PIT-37).
   */
  async generatePIT36LXML(
    tenantId: string,
    returnId: string,
  ): Promise<string> {
    const taxReturn = await this.fetchReturnWithRelations(tenantId, returnId);
    const company = await this.fetchCompany(taxReturn.company_id);
    const deductions = taxReturn.deductions || [];

    const deductionsFromIncome = deductions.filter(
      (d) => d.category === 'FROM_INCOME',
    );

    const declaration = {
      Deklaracja: {
        $: {
          xmlns: 'http://crd.gov.pl/wzor/2024/12/16/13799/',
        },
        Naglowek: this.buildNaglowek('PIT_36L', taxReturn.year),
        Podmiot1: this.buildPodmiot(company),
        PozycjeSzczegolowe: {
          // === Dzialnosc gospodarcza ===
          P_14: this.formatAmount(taxReturn.businessIncome), // Przychod z JDG
          P_15: this.formatAmount(taxReturn.businessCosts), // Koszty uzyskania
          P_16: this.formatAmount(taxReturn.businessProfit), // Dochod z JDG
          // === Odliczenia od dochodu ===
          P_22: this.formatAmount(taxReturn.zusDeduction), // Skladki ZUS spoleczne
          P_23: this.formatAmount(taxReturn.otherDeductions), // Inne odliczenia od dochodu
          P_24: this.formatAmount(taxReturn.taxBase), // Podstawa opodatkowania
          // === Obliczenie podatku (19%) ===
          P_25: this.formatAmount(taxReturn.taxCalculated), // Podatek 19%
          P_26: this.formatAmount(taxReturn.healthDeduction), // Odliczenie skladki zdrowotnej
          P_27: this.formatAmount(taxReturn.taxDue), // Podatek nalezny
          // === Zaliczki i rozliczenie ===
          P_28: this.formatAmount(taxReturn.advancesPaid), // Zaliczki zaplacone
          P_29: this.formatAmount(taxReturn.finalAmount), // Do zaplaty (+) lub nadplata (-)
        },
        // === Zalacznik - odliczenia od dochodu ===
        ...(deductionsFromIncome.length > 0
          ? {
              ZalacznikPIT_B: {
                Odliczenie: deductionsFromIncome.map((d) => ({
                  Typ: d.type,
                  Kwota: this.formatAmount(d.amount),
                  Opis: d.description,
                  ...(d.documentRef
                    ? { NrDokumentu: d.documentRef }
                    : {}),
                })),
              },
            }
          : {}),
      },
    };

    return this.buildXML(declaration);
  }

  // ============================================================
  // PIT-28 XML Generator (ryczalt ewidencjonowany)
  // ============================================================

  /**
   * Generate PIT-28 XML conforming to MF schema version 26.
   *
   * PIT-28 is used for taxpayers on the ryczalt (lump-sum) taxation.
   * Tax is calculated on revenue (not income), with no cost deductions.
   * Different rates apply to different types of activity.
   */
  async generatePIT28XML(tenantId: string, returnId: string): Promise<string> {
    const taxReturn = await this.fetchReturnWithRelations(tenantId, returnId);
    const company = await this.fetchCompany(taxReturn.company_id);
    const deductions = taxReturn.deductions || [];

    const deductionsFromIncome = deductions.filter(
      (d) => d.category === 'FROM_INCOME',
    );

    // Parse ryczalt rate to determine revenue breakdown by rate
    const ryczaltRate = taxReturn.ryczaltRate || 0.085;
    const ryczaltRevenue = taxReturn.ryczaltRevenue || 0;

    // Build revenue-by-rate breakdown
    // In a full implementation, this would come from monthly records
    // For now, assign all revenue to the declared rate
    const revenueByRate = this.buildRyczaltRevenueBreakdown(
      ryczaltRevenue,
      ryczaltRate,
    );

    const declaration = {
      Deklaracja: {
        $: {
          xmlns: 'http://crd.gov.pl/wzor/2024/12/16/13800/',
        },
        Naglowek: this.buildNaglowek('PIT_28', taxReturn.year),
        Podmiot1: this.buildPodmiot(company),
        PozycjeSzczegolowe: {
          // === Przychody wg stawek ryczaltu ===
          ...(revenueByRate.rate_3 > 0
            ? {
                P_16: this.formatAmount(revenueByRate.rate_3), // Przychody 3%
                P_17: this.formatAmount(revenueByRate.rate_3 * 0.03), // Ryczalt 3%
              }
            : {}),
          ...(revenueByRate.rate_5_5 > 0
            ? {
                P_18: this.formatAmount(revenueByRate.rate_5_5), // Przychody 5.5%
                P_19: this.formatAmount(revenueByRate.rate_5_5 * 0.055), // Ryczalt 5.5%
              }
            : {}),
          ...(revenueByRate.rate_8_5 > 0
            ? {
                P_20: this.formatAmount(revenueByRate.rate_8_5), // Przychody 8.5%
                P_21: this.formatAmount(revenueByRate.rate_8_5 * 0.085), // Ryczalt 8.5%
              }
            : {}),
          ...(revenueByRate.rate_12 > 0
            ? {
                P_22: this.formatAmount(revenueByRate.rate_12), // Przychody 12%
                P_23: this.formatAmount(revenueByRate.rate_12 * 0.12), // Ryczalt 12%
              }
            : {}),
          ...(revenueByRate.rate_15 > 0
            ? {
                P_24: this.formatAmount(revenueByRate.rate_15), // Przychody 15%
                P_25: this.formatAmount(revenueByRate.rate_15 * 0.15), // Ryczalt 15%
              }
            : {}),
          ...(revenueByRate.rate_17 > 0
            ? {
                P_26: this.formatAmount(revenueByRate.rate_17), // Przychody 17%
                P_27: this.formatAmount(revenueByRate.rate_17 * 0.17), // Ryczalt 17%
              }
            : {}),
          // === Podsumowanie ===
          P_40: this.formatAmount(ryczaltRevenue), // Przychod ogolem
          P_41: this.formatAmount(taxReturn.ryczaltTax || 0), // Ryczalt ogolem
          // === Odliczenia ===
          P_42: this.formatAmount(taxReturn.zusDeduction), // Skladki ZUS spoleczne
          P_43: this.formatAmount(taxReturn.healthDeduction), // Skladka zdrowotna
          P_44: this.formatAmount(taxReturn.otherDeductions), // Inne odliczenia
          // === Obliczenie podatku ===
          P_48: this.formatAmount(taxReturn.taxBase), // Podstawa opodatkowania
          P_49: this.formatAmount(taxReturn.taxCalculated), // Ryczalt po odliczeniach
          P_50: this.formatAmount(taxReturn.taxDue), // Podatek nalezny
          // === Zaliczki i rozliczenie ===
          P_51: this.formatAmount(taxReturn.advancesPaid), // Ryczalt zaplacony (zaliczki)
          P_52: this.formatAmount(taxReturn.finalAmount), // Do zaplaty (+) lub nadplata (-)
        },
        // === Zalacznik - odliczenia ===
        ...(deductionsFromIncome.length > 0
          ? {
              ZalacznikPIT_O: {
                OdliczeniaOdPrzychodu: {
                  Odliczenie: deductionsFromIncome.map((d) => ({
                    Typ: d.type,
                    Kwota: this.formatAmount(d.amount),
                    Opis: d.description,
                    ...(d.documentRef
                      ? { NrDokumentu: d.documentRef }
                      : {}),
                  })),
                },
              },
            }
          : {}),
      },
    };

    return this.buildXML(declaration);
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  /**
   * Build the common XML header (Naglowek) section.
   * Contains form code, version, purpose, and tax year.
   */
  private buildNaglowek(
    formType: string,
    year: number,
  ): Record<string, any> {
    const formConfig = this.getFormConfig(formType);

    return {
      KodFormularza: {
        _: formConfig.name,
        $: {
          kodSystemowy: formConfig.kodSystemowy,
          wersjaSchemy: formConfig.wersjaSchemy,
        },
      },
      WariantFormularza: formConfig.wariant,
      CelZlozenia: {
        _: '1', // 1 = zlozenie zeznania, 2 = korekta
        $: { plesion: '1' },
      },
      Rok: year.toString(),
    };
  }

  /**
   * Build the taxpayer identification (Podmiot1) section.
   * Populates NIP and basic identifying information from the Company record.
   */
  private buildPodmiot(company: any): Record<string, any> {
    return {
      OsobaFizyczna: {
        NIP: company.nip || '',
        Imie: company.name?.split(' ')[0] || '',
        Nazwisko: company.name?.split(' ').slice(1).join(' ') || '',
      },
      AdresZamieszkania: {
        KodKraju: 'PL',
        Miejscowosc: this.extractCity(company.address),
        Ulica: this.extractStreet(company.address),
        NrDomu: this.extractHouseNumber(company.address),
        KodPocztowy: this.extractPostalCode(company.address),
      },
    };
  }

  /**
   * Get form-specific configuration (code, version, variant) for XML header.
   */
  private getFormConfig(formType: string): {
    name: string;
    kodSystemowy: string;
    wersjaSchemy: string;
    wariant: string;
  } {
    switch (formType) {
      case 'PIT_36':
        return {
          name: 'PIT-36',
          kodSystemowy: 'PIT-36 (31)',
          wersjaSchemy: '1-0E',
          wariant: '31',
        };
      case 'PIT_36L':
        return {
          name: 'PIT-36L',
          kodSystemowy: 'PIT-36L (20)',
          wersjaSchemy: '1-0E',
          wariant: '20',
        };
      case 'PIT_28':
        return {
          name: 'PIT-28',
          kodSystemowy: 'PIT-28 (26)',
          wersjaSchemy: '1-0E',
          wariant: '26',
        };
      default:
        throw new BadRequestException(
          `Unknown form type: ${formType}`,
        );
    }
  }

  /**
   * Build ryczalt revenue breakdown by rate.
   * Assigns all revenue to the single declared rate.
   * A full implementation would aggregate from monthly ewidencja records.
   */
  private buildRyczaltRevenueBreakdown(
    totalRevenue: number,
    rate: number,
  ): {
    rate_3: number;
    rate_5_5: number;
    rate_8_5: number;
    rate_12: number;
    rate_15: number;
    rate_17: number;
  } {
    const breakdown = {
      rate_3: 0,
      rate_5_5: 0,
      rate_8_5: 0,
      rate_12: 0,
      rate_15: 0,
      rate_17: 0,
    };

    // Map the numeric rate to the breakdown field
    const rateToField: Record<number, keyof typeof breakdown> = {
      0.03: 'rate_3',
      0.055: 'rate_5_5',
      0.085: 'rate_8_5',
      0.12: 'rate_12',
      0.125: 'rate_12', // 12.5% rent maps to the 12% bucket for now
      0.15: 'rate_15',
      0.17: 'rate_17',
    };

    const field = rateToField[rate] || 'rate_8_5';
    breakdown[field] = totalRevenue;

    return breakdown;
  }

  /**
   * Format a numeric amount for XML output.
   * Rounds to 2 decimal places and returns as a string.
   */
  formatAmount(amount: number | null | undefined): string {
    if (amount == null) return '0.00';
    return (Math.round(amount * 100) / 100).toFixed(2);
  }

  /**
   * Format a Date object as YYYY-MM-DD string for XML.
   */
  formatDate(date: Date | string | null): string {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().split('T')[0];
  }

  /**
   * Build the final XML string from a JavaScript object using xml2js.Builder.
   */
  private async buildXML(obj: any): Promise<string> {
    const builder = new xml2js.Builder({
      xmldec: { version: '1.0', encoding: 'UTF-8', standalone: undefined },
      renderOpts: { pretty: true, indent: '  ', newline: '\n' },
      cdata: false,
    });

    return builder.buildObject(obj);
  }

  // ============================================================
  // Data Fetching
  // ============================================================

  /**
   * Fetch an AnnualTaxReturn with its deductions, validating tenant ownership.
   */
  private async fetchReturnWithRelations(
    tenantId: string,
    returnId: string,
  ): Promise<any> {
    const taxReturn = await this.prisma.annualTaxReturn.findFirst({
      where: {
        id: returnId,
        tenant_id: tenantId,
      },
      include: {
        deductions: true,
      },
    });

    if (!taxReturn) {
      throw new NotFoundException(
        `Annual tax return ${returnId} not found for tenant ${tenantId}`,
      );
    }

    return taxReturn;
  }

  /**
   * Fetch Company data for populating taxpayer identification fields.
   */
  private async fetchCompany(companyId: string): Promise<any> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    return company;
  }

  // ============================================================
  // Address Parsing Helpers
  // ============================================================

  /**
   * Extract city/town name from a Polish address string.
   * Expected format: "ul. Ulica 1, 00-000 Miasto" or similar.
   */
  private extractCity(address: string | null): string {
    if (!address) return '';
    // Try to extract city after postal code (XX-XXX Miasto)
    const postalMatch = address.match(/\d{2}-\d{3}\s+(.+?)(?:,|$)/);
    if (postalMatch) return postalMatch[1].trim();
    // Fallback: last comma-separated segment
    const parts = address.split(',');
    return parts[parts.length - 1]?.trim() || '';
  }

  /**
   * Extract street name from a Polish address string.
   */
  private extractStreet(address: string | null): string {
    if (!address) return '';
    // Try "ul. Name" or "al. Name" pattern
    const streetMatch = address.match(
      /(?:ul\.|al\.|pl\.)\s*([^,\d]+)/i,
    );
    if (streetMatch) return streetMatch[1].trim();
    // Fallback: first comma-separated segment
    const parts = address.split(',');
    return parts[0]?.trim() || '';
  }

  /**
   * Extract house number from a Polish address string.
   */
  private extractHouseNumber(address: string | null): string {
    if (!address) return '';
    // Match number (possibly with letter) after street name, e.g. "ul. Dluga 15A"
    const numMatch = address.match(
      /(?:ul\.|al\.|pl\.)?\s*[A-Za-z\u0080-\u024F\s]+\s+(\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)?)/i,
    );
    if (numMatch) return numMatch[1];
    return '';
  }

  /**
   * Extract postal code from a Polish address string.
   * Polish postal codes follow the XX-XXX format.
   */
  private extractPostalCode(address: string | null): string {
    if (!address) return '';
    const match = address.match(/(\d{2}-\d{3})/);
    return match ? match[1] : '';
  }
}
