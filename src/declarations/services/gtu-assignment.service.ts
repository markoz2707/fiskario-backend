import { Injectable, Logger } from '@nestjs/common';

export interface GTUCode {
  code: string;
  name: string;
  description: string;
  categories: string[];
  keywords: string[];
}

export interface GTUAssignmentResult {
  gtuCodes: string[];
  confidence: number;
  reasoning: string;
}

@Injectable()
export class GTUAssignmentService {
  private readonly logger = new Logger(GTUAssignmentService.name);

  // GTU codes according to Polish Ministry of Finance specifications
  private readonly gtuCodes: GTUCode[] = [
    {
      code: 'GTU_01',
      name: 'Dostawa napojów alkoholowych',
      description: 'Dostawa napojów alkoholowych o zawartości alkoholu powyżej 1,2% oraz napojów alkoholowych będących mieszaniną piwa i napojów bezalkoholowych',
      categories: ['alcohol', 'spirits', 'wine', 'beer', 'vodka', 'whiskey', 'rum'],
      keywords: ['alkohol', 'wódka', 'piwo', 'wino', 'whisky', 'rum', 'spirytus', 'szampan', 'cydr']
    },
    {
      code: 'GTU_02',
      name: 'Dostawa paliw',
      description: 'Dostawa paliw silnikowych, oleju opałowego, gazu w stanie ciekłym, olejów smarowych',
      categories: ['fuel', 'gasoline', 'diesel', 'oil', 'gas'],
      keywords: ['benzyna', 'ropa', 'olej', 'paliwo', 'gaz', 'propan', 'metan', 'lpg', 'cng']
    },
    {
      code: 'GTU_03',
      name: 'Dostawa oleju opałowego',
      description: 'Dostawa oleju opałowego w rozumieniu przepisów o podatku akcyzowym',
      categories: ['heating-oil', 'fuel-oil'],
      keywords: ['olej opałowy', 'mazut', 'opałowy']
    },
    {
      code: 'GTU_04',
      name: 'Dostawa wyrobów tytoniowych',
      description: 'Dostawa wyrobów tytoniowych, suszu tytoniowego, płynu do papierosów elektronicznych',
      categories: ['tobacco', 'cigarettes', 'cigars'],
      keywords: ['papierosy', 'tytoń', 'cygara', 'fajki', 'e-papierosy', 'liquid']
    },
    {
      code: 'GTU_05',
      name: 'Dostawa odpadów',
      description: 'Dostawa odpadów - wyłącznie określonych w poz. 79-91 załącznika nr 15 do ustawy',
      categories: ['waste', 'scrap', 'recycling'],
      keywords: ['odpady', 'śmieci', 'złom', 'makulatura', 'szkło', 'plastik', 'metal', 'elektrośmieci']
    },
    {
      code: 'GTU_06',
      name: 'Dostawa urządzeń elektronicznych',
      description: 'Dostawa urządzeń elektronicznych oraz części do nich',
      categories: ['electronics', 'computers', 'phones', 'appliances'],
      keywords: ['komputer', 'laptop', 'telefon', 'smartfon', 'tablet', 'drukarka', 'monitor', 'telewizor', 'radio', 'odtwarzacz']
    },
    {
      code: 'GTU_07',
      name: 'Dostawa pojazdów',
      description: 'Dostawa pojazdów oraz części samochodowych o wartości powyżej 20000 zł',
      categories: ['vehicles', 'cars', 'motorcycles', 'trucks'],
      keywords: ['samochód', 'auto', 'pojazd', 'motocykl', 'ciężarówka', 'części samochodowe']
    },
    {
      code: 'GTU_08',
      name: 'Dostawa metali szlachetnych',
      description: 'Dostawa metali szlachetnych oraz nieszlachetnych',
      categories: ['precious-metals', 'gold', 'silver', 'platinum'],
      keywords: ['złoto', 'srebro', 'platyna', 'pallad', 'metal', 'szlachetny', 'jubiler']
    },
    {
      code: 'GTU_09',
      name: 'Dostawa leków',
      description: 'Dostawa leków oraz wyrobów medycznych',
      categories: ['medicine', 'pharmaceuticals', 'medical-supplies'],
      keywords: ['lek', 'lekarstwo', 'medycyna', 'apteka', 'suplement', 'witamina', 'bandaż', 'strzykawka']
    },
    {
      code: 'GTU_10',
      name: 'Dostawa budynków',
      description: 'Dostawa budynków, budowli i gruntów',
      categories: ['buildings', 'construction', 'real-estate', 'land'],
      keywords: ['budynek', 'dom', 'mieszkanie', 'grunt', 'działka', 'hale', 'magazyn', 'biuro']
    },
    {
      code: 'GTU_11',
      name: 'Świadczenie usług w zakresie przenoszenia uprawnień',
      description: 'Świadczenie usług w zakresie przenoszenia uprawnień do emisji gazów cieplarnianych',
      categories: ['emissions', 'carbon-credits', 'environmental'],
      keywords: ['emisja', 'gaz cieplarniany', 'uprawnienia', 'środowisko', 'klimat', 'co2']
    },
    {
      code: 'GTU_12',
      name: 'Świadczenie usług o charakterze niematerialnym',
      description: 'Świadczenie usług o charakterze niematerialnym - wyłącznie: doradczych, księgowych, prawnych, zarządczych, szkoleniowych, marketingowych, firm centralnych, reklamowych, badania rynku i opinii publicznej',
      categories: ['services', 'consulting', 'accounting', 'legal', 'marketing'],
      keywords: ['doradztwo', 'księgowość', 'prawny', 'zarządzanie', 'szkolenie', 'marketing', 'reklama', 'badanie rynku']
    },
    {
      code: 'GTU_13',
      name: 'Świadczenie usług transportowych',
      description: 'Świadczenie usług transportowych i gospodarki magazynowej',
      categories: ['transport', 'logistics', 'shipping', 'warehousing'],
      keywords: ['transport', 'przewóz', 'logistyka', 'magazyn', 'spedycja', 'kurier', 'paczka']
    }
  ];

  /**
   * Assign GTU codes to invoice items based on description and category
   */
  assignGTUCodes(
    description: string,
    category?: string,
    amount?: number,
    additionalContext?: string
  ): GTUAssignmentResult {
    try {
      this.logger.log(`Assigning GTU codes for: ${description}`);

      const textToAnalyze = `${description} ${category || ''} ${additionalContext || ''}`.toLowerCase();
      const matchedCodes: string[] = [];
      let totalConfidence = 0;
      const reasoning: string[] = [];

      for (const gtuCode of this.gtuCodes) {
        const confidence = this.calculateConfidence(textToAnalyze, gtuCode);

        if (confidence > 0.3) { // Minimum confidence threshold
          matchedCodes.push(gtuCode.code);
          totalConfidence += confidence;
          reasoning.push(`${gtuCode.code}: ${Math.round(confidence * 100)}% confidence`);
        }
      }

      // Special handling for high-value items
      if (amount && amount > 20000 && this.containsKeywords(textToAnalyze, ['pojazd', 'samochód', 'auto'])) {
        if (!matchedCodes.includes('GTU_07')) {
          matchedCodes.push('GTU_07');
          reasoning.push('GTU_07: High value vehicle-related item');
        }
      }

      const averageConfidence = matchedCodes.length > 0 ? totalConfidence / matchedCodes.length : 0;

      this.logger.log(`Assigned GTU codes: ${matchedCodes.join(', ')} for ${description}`);

      return {
        gtuCodes: matchedCodes,
        confidence: averageConfidence,
        reasoning: reasoning.join('; ')
      };
    } catch (error) {
      this.logger.error(`Error assigning GTU codes: ${error.message}`, error.stack);
      return {
        gtuCodes: [],
        confidence: 0,
        reasoning: `Error: ${error.message}`
      };
    }
  }

  /**
   * Calculate confidence score for GTU code assignment
   */
  private calculateConfidence(text: string, gtuCode: GTUCode): number {
    let confidence = 0;
    const keywords = [...gtuCode.keywords, ...gtuCode.categories];

    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        confidence += 0.3; // Base score for keyword match
      }
    }

    // Boost confidence for exact phrase matches
    for (const keyword of gtuCode.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        confidence += 0.2;
      }
    }

    return Math.min(confidence, 1.0); // Cap at 100%
  }

  /**
   * Check if text contains any of the specified keywords
   */
  private containsKeywords(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword.toLowerCase()));
  }

  /**
   * Get all available GTU codes with descriptions
   */
  getAllGTUCodes(): GTUCode[] {
    return this.gtuCodes;
  }

  /**
   * Get GTU code details by code
   */
  getGTUCodeDetails(code: string): GTUCode | null {
    return this.gtuCodes.find(gtu => gtu.code === code) || null;
  }

  /**
   * Validate GTU code format
   */
  validateGTUCode(code: string): boolean {
    return this.gtuCodes.some(gtu => gtu.code === code);
  }

  /**
   * Get GTU codes for specific industry/category
   */
  getGTUCodesForCategory(category: string): string[] {
    const matchingCodes: string[] = [];

    for (const gtuCode of this.gtuCodes) {
      if (gtuCode.categories.some(cat => category.toLowerCase().includes(cat.toLowerCase()))) {
        matchingCodes.push(gtuCode.code);
      }
    }

    return matchingCodes;
  }
}