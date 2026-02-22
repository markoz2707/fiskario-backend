/**
 * Polish tax configuration for annual PIT returns.
 * Covers PIT-36 (skala podatkowa), PIT-36L (liniowy), PIT-28 (ryczalt).
 * Years 2024-2026.
 */

export interface TaxBracket {
  from: number;
  to: number;
  rate: number;
}

export interface ScaleConfig {
  brackets: TaxBracket[];
  freeAmount: number;       // Kwota wolna od podatku
  reductionAmount: number;  // Kwota zmniejszajaca podatek
}

export interface LinearConfig {
  rate: number;
  healthDeductionLimit: number; // Max odliczenie skladki zdrowotnej
}

export interface HealthConfig {
  scaleRate: number;        // Stawka zdrowotnej na skali
  linearRate: number;       // Stawka zdrowotnej na liniowym
  linearMin: number;        // Minimalna skladka zdrowotna liniowa (miesiecznie)
  ryczaltThresholds: {      // Progi przychodowe dla ryczaltu
    low: { maxRevenue: number; base: number; rate: number };
    mid: { maxRevenue: number; base: number; rate: number };
    high: { base: number; rate: number };
  };
}

export interface ChildReliefConfig {
  one: number;              // Ulga na 1 dziecko (roczna, pelna kwota)
  two: number;              // Ulga na 2 dziecko
  three: number;            // Ulga na 3 dziecko
  four: number;             // Ulga na 4+ dziecko (za kazde)
  incomeLimit: number;      // Limit dochodu dla 1 dziecka
}

export interface RyczaltRates {
  it: number;               // IT / programowanie
  freeProfessions: number;  // Wolne zawody
  rent: number;             // Najem prywatny
  trade: number;            // Handel
  production: number;       // Produkcja
  services: number;         // Uslugi
  gastronomy: number;       // Gastronomia
  construction: number;     // Budownictwo
  healthServices: number;   // Uslugi zdrowotne
  rentHigh: number;         // Najem powyzej 100 000 PLN
}

export interface YearTaxConfig {
  scale: ScaleConfig;
  linear: LinearConfig;
  health: HealthConfig;
  childRelief: ChildReliefConfig;
  internetRelief: number;           // Max odliczenie za internet
  donationLimit: number;            // Max % dochodu na darowizny
  ikzeLimit: number;                // Max wplata na IKZE
  thermomodernizationLimit: number; // Max ulga termomodernizacyjna
  rehabilitationLimit: number;      // Max ulga rehabilitacyjna
  bloodDonationRate: number;        // Stawka za litr krwi (PLN)
  employmentCostsStandard: number;  // Standardowe koszty uzyskania z etatu (roczne, 1 etat)
  employmentCostsElevated: number;  // Podwyzszone koszty (zamiejscowe)
  ryczaltRates: RyczaltRates;
  averageSalary: number;            // Przecietne wynagrodzenie (dla ZUS ryczalt)
}

export const TAX_CONFIG: Record<number, YearTaxConfig> = {
  2024: {
    scale: {
      brackets: [
        { from: 0, to: 120000, rate: 0.12 },
        { from: 120000, to: Infinity, rate: 0.32 },
      ],
      freeAmount: 30000,
      reductionAmount: 3600,
    },
    linear: {
      rate: 0.19,
      healthDeductionLimit: 11600,
    },
    health: {
      scaleRate: 0.09,
      linearRate: 0.049,
      linearMin: 314.10,
      ryczaltThresholds: {
        low:  { maxRevenue: 60000,  base: 4765.94, rate: 0.09 },   // 60% przecietnego
        mid:  { maxRevenue: 300000, base: 7943.24, rate: 0.09 },   // 100% przecietnego
        high: { base: 14297.83, rate: 0.09 },                       // 180% przecietnego
      },
    },
    childRelief: {
      one: 1112.04,
      two: 2000.04,     // Na drugie dziecko (lacznnie z pierwszym = 3112.08)
      three: 2700.00,   // Na trzecie dziecko
      four: 2700.00,    // Na czwarte i kazde kolejne
      incomeLimit: 112000,  // Limit dochodu dla 1 dziecka (lacznie z malzonkiem)
    },
    internetRelief: 760,
    donationLimit: 0.06,
    ikzeLimit: 9388.80,
    thermomodernizationLimit: 53000,
    rehabilitationLimit: 2280,  // Limit na leki (nadwyzka ponad 100 PLN/mies.)
    bloodDonationRate: 130,     // PLN za litr krwi
    employmentCostsStandard: 3000,  // 250 PLN * 12 miesiecy
    employmentCostsElevated: 3600,  // 300 PLN * 12 miesiecy
    ryczaltRates: {
      it: 0.12,
      freeProfessions: 0.15,
      rent: 0.085,
      trade: 0.03,
      production: 0.055,
      services: 0.085,
      gastronomy: 0.03,
      construction: 0.055,
      healthServices: 0.15,
      rentHigh: 0.125,   // Najem powyzej 100 000 PLN
    },
    averageSalary: 7943.24,
  },
  2025: {
    scale: {
      brackets: [
        { from: 0, to: 120000, rate: 0.12 },
        { from: 120000, to: Infinity, rate: 0.32 },
      ],
      freeAmount: 30000,
      reductionAmount: 3600,
    },
    linear: {
      rate: 0.19,
      healthDeductionLimit: 11600,
    },
    health: {
      scaleRate: 0.09,
      linearRate: 0.049,
      linearMin: 314.10,
      ryczaltThresholds: {
        low:  { maxRevenue: 60000,  base: 5104.90, rate: 0.09 },
        mid:  { maxRevenue: 300000, base: 8508.17, rate: 0.09 },
        high: { base: 15314.71, rate: 0.09 },
      },
    },
    childRelief: {
      one: 1112.04,
      two: 2000.04,
      three: 2700.00,
      four: 2700.00,
      incomeLimit: 112000,
    },
    internetRelief: 760,
    donationLimit: 0.06,
    ikzeLimit: 9867.60,
    thermomodernizationLimit: 53000,
    rehabilitationLimit: 2280,
    bloodDonationRate: 130,
    employmentCostsStandard: 3000,
    employmentCostsElevated: 3600,
    ryczaltRates: {
      it: 0.12,
      freeProfessions: 0.15,
      rent: 0.085,
      trade: 0.03,
      production: 0.055,
      services: 0.085,
      gastronomy: 0.03,
      construction: 0.055,
      healthServices: 0.15,
      rentHigh: 0.125,
    },
    averageSalary: 8508.17,
  },
  2026: {
    scale: {
      brackets: [
        { from: 0, to: 120000, rate: 0.12 },
        { from: 120000, to: Infinity, rate: 0.32 },
      ],
      freeAmount: 30000,
      reductionAmount: 3600,
    },
    linear: {
      rate: 0.19,
      healthDeductionLimit: 11600,
    },
    health: {
      scaleRate: 0.09,
      linearRate: 0.049,
      linearMin: 314.10,
      ryczaltThresholds: {
        low:  { maxRevenue: 60000,  base: 5404.00, rate: 0.09 },
        mid:  { maxRevenue: 300000, base: 9006.67, rate: 0.09 },
        high: { base: 16212.01, rate: 0.09 },
      },
    },
    childRelief: {
      one: 1112.04,
      two: 2000.04,
      three: 2700.00,
      four: 2700.00,
      incomeLimit: 112000,
    },
    internetRelief: 760,
    donationLimit: 0.06,
    ikzeLimit: 10346.40,
    thermomodernizationLimit: 53000,
    rehabilitationLimit: 2280,
    bloodDonationRate: 130,
    employmentCostsStandard: 3000,
    employmentCostsElevated: 3600,
    ryczaltRates: {
      it: 0.12,
      freeProfessions: 0.15,
      rent: 0.085,
      trade: 0.03,
      production: 0.055,
      services: 0.085,
      gastronomy: 0.03,
      construction: 0.055,
      healthServices: 0.15,
      rentHigh: 0.125,
    },
    averageSalary: 9006.67,
  },
};

/**
 * Get tax configuration for a given year.
 * Falls back to nearest available year if exact year is not configured.
 */
export function getTaxConfig(year: number): YearTaxConfig {
  if (TAX_CONFIG[year]) {
    return TAX_CONFIG[year];
  }

  // Fall back to the closest configured year
  const availableYears = Object.keys(TAX_CONFIG).map(Number).sort((a, b) => a - b);
  const closestYear = availableYears.reduce((prev, curr) =>
    Math.abs(curr - year) < Math.abs(prev - year) ? curr : prev,
  );

  return TAX_CONFIG[closestYear];
}

/**
 * Round to full PLN (zaokraglenie do pelnych zlotych).
 * Used for tax base and tax amounts per Polish tax law.
 */
export function roundToFullPLN(amount: number): number {
  return Math.round(amount);
}

/**
 * Round to grosze (2 decimal places).
 */
export function roundToGrosze(amount: number): number {
  return Math.round(amount * 100) / 100;
}
