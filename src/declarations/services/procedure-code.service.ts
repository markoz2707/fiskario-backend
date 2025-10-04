import { Injectable, Logger } from '@nestjs/common';

export interface ProcedureCode {
  code: string;
  name: string;
  description: string;
  category: 'domestic' | 'import' | 'export' | 'intra-eu' | 'special';
  conditions: string[];
  isActive: boolean;
}

export interface ProcedureAssignmentResult {
  procedureCodes: string[];
  confidence: number;
  reasoning: string;
  requiresAdditionalInfo: boolean;
}

@Injectable()
export class ProcedureCodeService {
  private readonly logger = new Logger(ProcedureCodeService.name);

  // Procedure codes according to Polish VAT law
  private readonly procedureCodes: ProcedureCode[] = [
    {
      code: 'SW',
      name: 'Stawka W',
      description: 'Procedura odwrotnego obciążenia dla dostaw towarów wrażliwych',
      category: 'domestic',
      conditions: ['reverse_charge', 'sensitive_goods', 'building_services'],
      isActive: true
    },
    {
      code: 'EE',
      name: 'Eksport bezpośredni',
      description: 'Bezpośredni eksport towarów poza terytorium UE',
      category: 'export',
      conditions: ['direct_export', 'outside_eu', 'export_declaration'],
      isActive: true
    },
    {
      code: 'TP',
      name: 'Eksport pośredni',
      description: 'Pośredni eksport towarów poza terytorium UE',
      category: 'export',
      conditions: ['indirect_export', 'outside_eu', 'export_documentation'],
      isActive: true
    },
    {
      code: 'TT_WNT',
      name: 'WNT z terytorium państwa trzeciego',
      description: 'Wewnątrzwspólnotowe nabycie towarów z terytorium państwa trzeciego',
      category: 'intra-eu',
      conditions: ['intra_community', 'third_country', 'wnt'],
      isActive: true
    },
    {
      code: 'TT_D',
      name: 'Dostawa w ramach transakcji trójstronnej',
      description: 'Dostawa towarów w ramach procedury uproszczonej transakcji trójstronnej',
      category: 'intra-eu',
      conditions: ['triangular_transaction', 'simplified_procedure'],
      isActive: true
    },
    {
      code: 'MR_T',
      name: 'Marża - towary używane',
      description: 'Procedura marży dla towarów używanych, dzieł sztuki, przedmiotów kolekcjonerskich',
      category: 'special',
      conditions: ['used_goods', 'art', 'collectibles', 'margin_scheme'],
      isActive: true
    },
    {
      code: 'MR_UZ',
      name: 'Marża - usługi turystyki',
      description: 'Procedura marży dla usług turystycznych',
      category: 'special',
      conditions: ['tourism_services', 'travel_services', 'margin_scheme'],
      isActive: true
    },
    {
      code: 'MP',
      name: 'Metale inwestycyjne',
      description: 'Procedura dla dostaw metali inwestycyjnych',
      category: 'special',
      conditions: ['investment_metals', 'gold', 'silver', 'platinum'],
      isActive: true
    },
    {
      code: 'MPP',
      name: 'Mechanizm podzielonej płatności',
      description: 'Obowiązkowy mechanizm podzielonej płatności',
      category: 'domestic',
      conditions: ['split_payment', 'mandatory', 'high_value'],
      isActive: true
    },
    {
      code: 'I_42',
      name: 'Import z art. 42 ust. 1',
      description: 'Import towarów z zastosowaniem procedury uproszczonej',
      category: 'import',
      conditions: ['import', 'simplified_procedure', 'article_42'],
      isActive: true
    },
    {
      code: 'I_13',
      name: 'Import z art. 13 ust. 1',
      description: 'Import towarów z zastosowaniem procedury standardowej',
      category: 'import',
      conditions: ['import', 'standard_procedure', 'article_13'],
      isActive: true
    },
    {
      code: 'B_SPV',
      name: 'Stawka 0% dla eksportu',
      description: 'Stawka VAT 0% dla eksportu towarów',
      category: 'export',
      conditions: ['export', 'zero_rate', 'export_documentation'],
      isActive: true
    },
    {
      code: 'B_SPV_DOSTAWA',
      name: 'Stawka 0% dla dostaw',
      description: 'Stawka VAT 0% dla wewnątrzwspólnotowej dostawy towarów',
      category: 'intra-eu',
      conditions: ['intra_community_supply', 'zero_rate'],
      isActive: true
    },
    {
      code: 'B_MPV_PROWADZENIE',
      name: 'Miejsce świadczenia poza Polską',
      description: 'Świadczenie usług, dla których miejscem świadczenia nie jest Polska',
      category: 'special',
      conditions: ['services_abroad', 'place_of_supply_outside_poland'],
      isActive: true
    },
    {
      code: 'OO',
      name: 'Odstępstwo od odwrotnego obciążenia',
      description: 'Odstępstwo od procedury odwrotnego obciążenia',
      category: 'domestic',
      conditions: ['reverse_charge_exemption', 'special_circumstances'],
      isActive: true
    }
  ];

  /**
   * Assign procedure codes based on transaction details
   */
  assignProcedureCodes(transactionData: {
    description?: string;
    counterpartyCountry?: string;
    isEU?: boolean;
    amount?: number;
    category?: string;
    documentType?: string;
    isExport?: boolean;
    isImport?: boolean;
    isTriangular?: boolean;
    vatRate?: number;
    isSensitiveGoods?: boolean;
    isUsedGoods?: boolean;
    isTourism?: boolean;
    isInvestmentMetal?: boolean;
    requiresSplitPayment?: boolean;
  }): ProcedureAssignmentResult {
    try {
      this.logger.log(`Assigning procedure codes for transaction: ${transactionData.description || 'No description'}`);

      const matchedCodes: string[] = [];
      let totalConfidence = 0;
      const reasoning: string[] = [];

      // Check each procedure code against transaction data
      for (const procedureCode of this.procedureCodes) {
        if (!procedureCode.isActive) continue;

        const confidence = this.calculateProcedureConfidence(transactionData, procedureCode);

        if (confidence > 0.4) { // Higher threshold for procedure codes
          matchedCodes.push(procedureCode.code);
          totalConfidence += confidence;
          reasoning.push(`${procedureCode.code}: ${Math.round(confidence * 100)}% confidence`);
        }
      }

      // Special logic for mandatory split payment
      if (transactionData.requiresSplitPayment || (transactionData.amount && transactionData.amount > 15000)) {
        if (!matchedCodes.includes('MPP')) {
          matchedCodes.push('MPP');
          reasoning.push('MPP: High value transaction requiring split payment');
        }
      }

      // Special logic for zero-rate exports
      if (transactionData.isExport && transactionData.vatRate === 0) {
        if (!matchedCodes.includes('B_SPV')) {
          matchedCodes.push('B_SPV');
          reasoning.push('B_SPV: Zero-rate export transaction');
        }
      }

      const averageConfidence = matchedCodes.length > 0 ? totalConfidence / matchedCodes.length : 0;
      const requiresAdditionalInfo = this.requiresAdditionalInfo(matchedCodes);

      this.logger.log(`Assigned procedure codes: ${matchedCodes.join(', ')}`);

      return {
        procedureCodes: matchedCodes,
        confidence: averageConfidence,
        reasoning: reasoning.join('; '),
        requiresAdditionalInfo
      };
    } catch (error) {
      this.logger.error(`Error assigning procedure codes: ${error.message}`, error.stack);
      return {
        procedureCodes: [],
        confidence: 0,
        reasoning: `Error: ${error.message}`,
        requiresAdditionalInfo: false
      };
    }
  }

  /**
   * Calculate confidence for procedure code assignment
   */
  private calculateProcedureConfidence(transactionData: any, procedureCode: ProcedureCode): number {
    let confidence = 0;

    // Check country/region conditions
    if (procedureCode.category === 'export' && transactionData.isExport) {
      confidence += 0.8;
    }

    if (procedureCode.category === 'import' && transactionData.isImport) {
      confidence += 0.8;
    }

    if (procedureCode.category === 'intra-eu' && transactionData.isEU) {
      confidence += 0.6;
    }

    // Check specific conditions
    for (const condition of procedureCode.conditions) {
      if (transactionData[condition] === true) {
        confidence += 0.7;
      }
    }

    // Check description keywords
    if (transactionData.description) {
      const descLower = transactionData.description.toLowerCase();
      for (const condition of procedureCode.conditions) {
        if (descLower.includes(condition.toLowerCase())) {
          confidence += 0.3;
        }
      }
    }

    // Special handling for triangular transactions
    if (procedureCode.code === 'TT_D' && transactionData.isTriangular) {
      confidence += 0.9;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Check if additional information is required for the assigned codes
   */
  private requiresAdditionalInfo(codes: string[]): boolean {
    const infoRequiredCodes = ['EE', 'TP', 'TT_D', 'I_42', 'I_13'];
    return codes.some(code => infoRequiredCodes.includes(code));
  }

  /**
   * Get all available procedure codes
   */
  getAllProcedureCodes(): ProcedureCode[] {
    return this.procedureCodes.filter(code => code.isActive);
  }

  /**
   * Get procedure code details by code
   */
  getProcedureCodeDetails(code: string): ProcedureCode | null {
    return this.procedureCodes.find(proc => proc.code === code) || null;
  }

  /**
   * Validate procedure code format
   */
  validateProcedureCode(code: string): boolean {
    return this.procedureCodes.some(proc => proc.code === code && proc.isActive);
  }

  /**
   * Get procedure codes for specific category
   */
  getProcedureCodesForCategory(category: string): ProcedureCode[] {
    return this.procedureCodes.filter(proc =>
      proc.category === category && proc.isActive
    );
  }

  /**
   * Check if transaction requires specific procedure codes
   */
  requiresProcedureCodes(transactionData: any): boolean {
    const result = this.assignProcedureCodes(transactionData);
    return result.procedureCodes.length > 0 && result.confidence > 0.5;
  }
}