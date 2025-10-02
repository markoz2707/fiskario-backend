import { Injectable } from '@nestjs/common';
import { DeclarationType } from '../dto/tax-calculation.dto';

@Injectable()
export class XMLGenerationService {

  /**
   * Generate JPK_V7 XML for monthly or quarterly submission
   */
  generateJPKV7XML(calculationData: any, companyInfo: any, variant: 'M' | 'K'): string {
    const { period, details } = calculationData;
    const { salesByRate, purchasesByRate, vatRegisters } = details;

    const year = period.split('-')[0];
    const month = variant === 'M' ? period.split('-')[1] : null;
    const quarter = variant === 'K' ? this.getQuarterFromMonth(period.split('-')[1]) : null;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<JPK xmlns="http://jpk.mf.gov.pl/wersja/v7">
  <Naglowek>
    <KodFormularza>JPK_V7${variant}</KodFormularza>
    <WariantFormularza>${variant}</WariantFormularza>
    <DataWytworzeniaJPK>${new Date().toISOString().split('T')[0]}</DataWytworzeniaJPK>
    <NazwaSystemu>Fiskario</NazwaSystemu>
    <Version>${year}${month || quarter}01</Version>
  </Naglowek>
  <Podmiot1>
    <NIP>${companyInfo.nip}</NIP>
    <PelnaNazwa>${companyInfo.name}</PelnaNazwa>
    <REGON>${companyInfo.regon || ''}</REGON>
  </Podmiot1>
  <Deklaracja>
    <Naglowek>
      <KodFormularzaDekl>VAT-7</KodFormularzaDekl>
      <WariantFormularzaDekl>${variant === 'M' ? '1' : '2'}</WariantFormularzaDekl>
      <Version>${year}${month || quarter}01</Version>
    </Naglowek>
    <PozycjeSzczegolowe>
      <P_10>${Math.round(calculationData.totalSalesVAT)}</P_10>
      <P_11>${Math.round(calculationData.vatPaidPurchases)}</P_11>
      <P_12>${Math.round(calculationData.vatDue)}</P_12>
      <P_13>0</P_13>
      <P_14>0</P_14>
      <P_15>${Math.round(calculationData.vatDue)}</P_15>
      <P_16>0</P_16>
      <P_17>0</P_17>
      <P_18>0</P_18>
      <P_19>0</P_19>
      <P_20>0</P_20>
      <P_21>0</P_21>
      <P_22>0</P_22>
      <P_23>0</P_23>
      <P_24>0</P_24>
      <P_25>0</P_25>
      <P_26>0</P_26>
      <P_27>0</P_27>
      <P_28>0</P_28>
      <P_29>0</P_29>
      <P_30>0</P_30>
      <P_31>0</P_31>
      <P_32>0</P_32>
      <P_33>0</P_33>
      <P_34>0</P_34>
      <P_35>0</P_35>
      <P_36>0</P_36>
      <P_37>0</P_37>
      <P_38>0</P_38>
      <P_39>0</P_39>
      <P_40>0</P_40>
      <P_41>0</P_41>
      <P_42>0</P_42>
      <P_43>0</P_43>
      <P_44>0</P_44>
      <P_45>0</P_45>
      <P_46>0</P_46>
      <P_47>0</P_47>
      <P_48>0</P_48>
      <P_49>0</P_49>
      <P_50>0</P_50>
      <P_51>0</P_51>
      <P_52>0</P_52>
      <P_53>0</P_53>
      <P_54>0</P_54>
      <P_55>0</P_55>
      <P_56>0</P_56>
      <P_57>0</P_57>
      <P_58>0</P_58>
      <P_59>0</P_59>
      <P_60>0</P_60>
      <P_61>0</P_61>
      <P_62>0</P_62>
      <P_63>0</P_63>
      <P_64>0</P_64>
      <P_65>0</P_65>
      <P_66>0</P_66>
      <P_67>0</P_67>
      <P_68>0</P_68>
      <P_69>0</P_69>
      <P_70>0</P_70>
      <P_71>0</P_71>
      <P_72>0</P_72>
      <P_73>0</P_73>
    </PozycjeSzczegolowe>
  </Deklaracja>
  <Ewidencja>
    <Naglowek>
      <KodFormularzaEwid>VAT</KodFormularzaEwid>
      <WariantFormularzaEwid>1</WariantFormularzaEwid>
      <Version>${year}${month || quarter}01</Version>
    </Naglowek>
    <SprzedazWiersz>`;

    // Add sales entries
    const salesEntries = vatRegisters.filter(reg => reg.type === 'sprzedaz');
    for (const sale of salesEntries) {
      xml += `
      <LpSprzedazy>${salesEntries.indexOf(sale) + 1}</LpSprzedazy>
      <NrKontrahenta>${sale.counterpartyNIP || ''}</NrKontrahenta>
      <NazwaKontrahenta>${sale.counterpartyName}</NazwaKontrahenta>
      <AdresKontrahenta>${sale.counterpartyAddress || ''}</AdresKontrahenta>
      <DowodSprzedazy>${sale.invoiceNumber}</DowodSprzedazy>
      <DataWystawienia>${sale.invoiceDate.toISOString().split('T')[0]}</DataWystawienia>
      <DataSprzedazy>${sale.invoiceDate.toISOString().split('T')[0]}</DataSprzedazy>
      <K_10>${Math.round(sale.netAmount)}</K_10>
      <K_11>${Math.round(sale.vatAmount)}</K_11>
      <K_12>${Math.round(sale.netAmount + sale.vatAmount)}</K_12>
      <K_13>${sale.vatRate}</K_13>
      <K_14>0</K_14>
      <K_15>0</K_15>
      <K_16>0</K_16>
      <K_17>0</K_17>
      <K_18>0</K_18>
      <K_19>0</K_19>
      <K_20>${sale.gtuCode || ''}</K_20>`;
    }

    xml += `
    </SprzedazWiersz>
    <ZakupWiersz>`;

    // Add purchase entries
    const purchaseEntries = vatRegisters.filter(reg => reg.type === 'zakup');
    for (const purchase of purchaseEntries) {
      xml += `
      <LpZakupu>${purchaseEntries.indexOf(purchase) + 1}</LpZakupu>
      <NrDostawcy>${purchase.counterpartyNIP || ''}</NrDostawcy>
      <NazwaDostawcy>${purchase.counterpartyName}</NazwaDostawcy>
      <AdresDostawcy>${purchase.counterpartyAddress || ''}</AdresDostawcy>
      <DowodZakupu>${purchase.invoiceNumber}</DowodZakupu>
      <DataZakupu>${purchase.invoiceDate.toISOString().split('T')[0]}</DataZakupu>
      <DataWplywu>${purchase.invoiceDate.toISOString().split('T')[0]}</DataWplywu>
      <K_40>${Math.round(purchase.netAmount)}</K_40>
      <K_41>${Math.round(purchase.vatAmount)}</K_41>
      <K_42>${Math.round(purchase.netAmount + purchase.vatAmount)}</K_42>
      <K_43>${purchase.vatRate}</K_43>
      <K_44>0</K_44>
      <K_45>0</K_45>
      <K_46>0</K_46>
      <K_47>0</K_47>
      <K_48>0</K_48>
      <K_49>0</K_49>
      <K_50>${purchase.gtuCode || ''}</K_50>`;
    }

    xml += `
    </ZakupWiersz>
  </Ewidencja>
</JPK>`;

    return xml;
  }

  /**
   * Generate VAT-7 XML declaration
   */
  generateVAT7XML(calculationData: any, companyInfo: any): string {
    const { period, details } = calculationData;
    const year = period.split('-')[0];
    const month = period.split('-')[1];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Deklaracja xmlns="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2023/06/16/eD/DEKLARACJA/">
  <Naglowek>
    <KodFormularzaDekl>VAT-7</KodFormularzaDekl>
    <WariantFormularzaDekl>23</WariantFormularzaDekl>
    <Version>${year}${month}01</Version>
    <DataWytworzeniaDekl>${new Date().toISOString().split('T')[0]}</DataWytworzeniaDekl>
    <NazwaSystemu>Fiskario</NazwaSystemu>
  </Naglowek>
  <Podmiot1>
    <NIP>${companyInfo.nip}</NIP>
    <PelnaNazwa>${companyInfo.name}</PelnaNazwa>
    <REGON>${companyInfo.regon || ''}</REGON>
    <DataPowstania>${companyInfo.establishmentDate || ''}</DataPowstania>
    <KodKraju>${companyInfo.countryCode || 'PL'}</KodKraju>
    <Wojewodztwo>${companyInfo.voivodeship || ''}</Wojewodztwo>
    <Powiat>${companyInfo.county || ''}</Powiat>
    <Gmina>${companyInfo.commune || ''}</Gmina>
    <Ulica>${companyInfo.street || ''}</Ulica>
    <NrDomu>${companyInfo.buildingNumber || ''}</NrDomu>
    <NrLokalu>${companyInfo.apartmentNumber || ''}</NrLokalu>
    <Miejscowosc>${companyInfo.city || ''}</Miejscowosc>
    <KodPocztowy>${companyInfo.postalCode || ''}</KodPocztowy>
  </Podmiot1>
  <PozycjeSzczegolowe>
    <P_10>${Math.round(details.summary.totalSalesVAT)}</P_10>
    <P_11>${Math.round(details.summary.totalPurchasesVAT)}</P_11>
    <P_12>${Math.round(details.summary.totalSalesVAT - details.summary.totalPurchasesVAT)}</P_12>
    <P_13>0</P_13>
    <P_14>0</P_14>
    <P_15>${Math.round(details.summary.totalSalesVAT - details.summary.totalPurchasesVAT)}</P_15>
    <P_16>0</P_16>
    <P_17>0</P_17>
    <P_18>0</P_18>
    <P_19>0</P_19>
    <P_20>0</P_20>
    <P_21>0</P_21>
    <P_22>0</P_22>
    <P_23>0</P_23>
    <P_24>0</P_24>
    <P_25>0</P_25>
    <P_26>0</P_26>
    <P_27>0</P_27>
    <P_28>0</P_28>
    <P_29>0</P_29>
    <P_30>0</P_30>
    <P_31>0</P_31>
    <P_32>0</P_32>
    <P_33>0</P_33>
    <P_34>0</P_34>
    <P_35>0</P_35>
    <P_36>0</P_36>
    <P_37>0</P_37>
    <P_38>0</P_38>
    <P_39>0</P_39>
    <P_40>0</P_40>
    <P_41>0</P_41>
    <P_42>0</P_42>
    <P_43>0</P_43>
    <P_44>0</P_44>
    <P_45>0</P_45>
    <P_46>0</P_46>
    <P_47>0</P_47>
    <P_48>0</P_48>
    <P_49>0</P_49>
    <P_50>0</P_50>
    <P_51>0</P_51>
    <P_52>0</P_52>
    <P_53>0</P_53>
    <P_54>0</P_54>
    <P_55>0</P_55>
    <P_56>0</P_56>
    <P_57>0</P_57>
    <P_58>0</P_58>
    <P_59>0</P_59>
    <P_60>0</P_60>
    <P_61>0</P_61>
    <P_62>0</P_62>
    <P_63>0</P_63>
    <P_64>0</P_64>
    <P_65>0</P_65>
    <P_66>0</P_66>
    <P_67>0</P_67>
    <P_68>0</P_68>
    <P_69>0</P_69>
    <P_70>0</P_70>
    <P_71>0</P_71>
    <P_72>0</P_72>
    <P_73>0</P_73>
  </PozycjeSzczegolowe>
</Deklaracja>`;

    return xml;
  }

  /**
   * Generate PIT-36 XML for annual tax return
   */
  generatePIT36XML(calculationData: any, companyInfo: any): string {
    const { period, taxableIncome, taxDue, advanceToPay } = calculationData;
    const year = period.split('-')[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Deklaracja xmlns="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2023/06/16/eD/DEKLARACJA/">
  <Naglowek>
    <KodFormularzaDekl>PIT-36</KodFormularzaDekl>
    <WariantFormularzaDekl>28</WariantFormularzaDekl>
    <Version>${year}0101</Version>
    <DataWytworzeniaDekl>${new Date().toISOString().split('T')[0]}</DataWytworzeniaDekl>
    <NazwaSystemu>Fiskario</NazwaSystemu>
  </Naglowek>
  <Podmiot1>
    <NIP>${companyInfo.nip}</NIP>
    <PelnaNazwa>${companyInfo.name}</PelnaNazwa>
    <REGON>${companyInfo.regon || ''}</REGON>
    <DataPowstania>${companyInfo.establishmentDate || ''}</DataPowstania>
  </Podmiot1>
  <PozycjeSzczegolowe>
    <P_1>${Math.round(taxableIncome)}</P_1>
    <P_2>${Math.round(taxDue)}</P_2>
    <P_3>${Math.round(advanceToPay)}</P_3>
    <P_4>0</P_4>
    <P_5>0</P_5>
    <P_6>0</P_6>
    <P_7>0</P_7>
    <P_8>0</P_8>
    <P_9>0</P_9>
    <P_10>0</P_10>
    <P_11>0</P_11>
    <P_12>0</P_12>
    <P_13>0</P_13>
    <P_14>0</P_14>
    <P_15>0</P_15>
    <P_16>0</P_16>
    <P_17>0</P_17>
    <P_18>0</P_18>
    <P_19>0</P_19>
    <P_20>0</P_20>
    <P_21>0</P_21>
    <P_22>0</P_22>
    <P_23>0</P_23>
    <P_24>0</P_24>
    <P_25>0</P_25>
    <P_26>0</P_26>
    <P_27>0</P_27>
    <P_28>0</P_28>
    <P_29>0</P_29>
    <P_30>0</P_30>
    <P_31>0</P_31>
    <P_32>0</P_32>
    <P_33>0</P_33>
    <P_34>0</P_34>
    <P_35>0</P_35>
    <P_36>0</P_36>
    <P_37>0</P_37>
    <P_38>0</P_38>
    <P_39>0</P_39>
    <P_40>0</P_40>
    <P_41>0</P_41>
    <P_42>0</P_42>
    <P_43>0</P_43>
    <P_44>0</P_44>
    <P_45>0</P_45>
    <P_46>0</P_46>
    <P_47>0</P_47>
    <P_48>0</P_48>
    <P_49>0</P_49>
    <P_50>0</P_50>
    <P_51>0</P_51>
    <P_52>0</P_52>
    <P_53>0</P_53>
    <P_54>0</P_54>
    <P_55>0</P_55>
    <P_56>0</P_56>
    <P_57>0</P_57>
    <P_58>0</P_58>
    <P_59>0</P_59>
    <P_60>0</P_60>
    <P_61>0</P_61>
    <P_62>0</P_62>
    <P_63>0</P_63>
    <P_64>0</P_64>
    <P_65>0</P_65>
    <P_66>0</P_66>
    <P_67>0</P_67>
    <P_68>0</P_68>
    <P_69>0</P_69>
    <P_70>0</P_70>
    <P_71>0</P_71>
    <P_72>0</P_72>
    <P_73>0</P_73>
    <P_74>0</P_74>
    <P_75>0</P_75>
    <P_76>0</P_76>
    <P_77>0</P_77>
    <P_78>0</P_78>
    <P_79>0</P_79>
    <P_80>0</P_80>
    <P_81>0</P_81>
    <P_82>0</P_82>
    <P_83>0</P_83>
    <P_84>0</P_84>
    <P_85>0</P_85>
    <P_86>0</P_86>
    <P_87>0</P_87>
    <P_88>0</P_88>
    <P_89>0</P_89>
    <P_90>0</P_90>
    <P_91>0</P_91>
    <P_92>0</P_92>
    <P_93>0</P_93>
    <P_94>0</P_94>
    <P_95>0</P_95>
    <P_96>0</P_96>
    <P_97>0</P_97>
    <P_98>0</P_98>
    <P_99>0</P_99>
    <P_100>0</P_100>
    <P_101>0</P_101>
    <P_102>0</P_102>
    <P_103>0</P_103>
    <P_104>0</P_104>
    <P_105>0</P_105>
    <P_106>0</P_106>
    <P_107>0</P_107>
    <P_108>0</P_108>
    <P_109>0</P_109>
    <P_110>0</P_110>
    <P_111>0</P_111>
    <P_112>0</P_112>
    <P_113>0</P_113>
    <P_114>0</P_114>
    <P_115>0</P_115>
    <P_116>0</P_116>
    <P_117>0</P_117>
    <P_118>0</P_118>
    <P_119>0</P_119>
    <P_120>0</P_120>
    <P_121>0</P_121>
    <P_122>0</P_122>
    <P_123>0</P_123>
    <P_124>0</P_124>
    <P_125>0</P_125>
    <P_126>0</P_126>
    <P_127>0</P_127>
    <P_128>0</P_128>
    <P_129>0</P_129>
    <P_130>0</P_130>
    <P_131>0</P_131>
    <P_132>0</P_132>
    <P_133>0</P_133>
    <P_134>0</P_134>
    <P_135>0</P_135>
    <P_136>0</P_136>
    <P_137>0</P_137>
    <P_138>0</P_138>
    <P_139>0</P_139>
    <P_140>0</P_140>
    <P_141>0</P_141>
    <P_142>0</P_142>
    <P_143>0</P_143>
    <P_144>0</P_144>
    <P_145>0</P_145>
    <P_146>0</P_146>
    <P_147>0</P_147>
    <P_148>0</P_148>
    <P_149>0</P_149>
    <P_150>0</P_150>
    <P_151>0</P_151>
    <P_152>0</P_152>
    <P_153>0</P_153>
    <P_154>0</P_154>
    <P_155>0</P_155>
    <P_156>0</P_156>
    <P_157>0</P_157>
    <P_158>0</P_158>
    <P_159>0</P_159>
    <P_160>0</P_160>
    <P_161>0</P_161>
    <P_162>0</P_162>
    <P_163>0</P_163>
    <P_164>0</P_164>
    <P_165>0</P_165>
    <P_166>0</P_166>
    <P_167>0</P_167>
    <P_168>0</P_168>
    <P_169>0</P_169>
    <P_170>0</P_170>
    <P_171>0</P_171>
    <P_172>0</P_172>
    <P_173>0</P_173>
    <P_174>0</P_174>
    <P_175>0</P_175>
    <P_176>0</P_176>
    <P_177>0</P_177>
    <P_178>0</P_178>
    <P_179>0</P_179>
    <P_180>0</P_180>
    <P_181>0</P_181>
    <P_182>0</P_182>
    <P_183>0</P_183>
    <P_184>0</P_184>
    <P_185>0</P_185>
    <P_186>0</P_186>
    <P_187>0</P_187>
    <P_188>0</P_188>
    <P_189>0</P_189>
    <P_190>0</P_190>
    <P_191>0</P_191>
    <P_192>0</P_192>
    <P_193>0</P_193>
    <P_194>0</P_194>
    <P_195>0</P_195>
    <P_196>0</P_196>
    <P_197>0</P_197>
    <P_198>0</P_198>
    <P_199>0</P_199>
    <P_200>0</P_200>
  </PozycjeSzczegolowe>
</Deklaracja>`;

    return xml;
  }

  /**
   * Helper method to get quarter from month
   */
  private getQuarterFromMonth(month: string): string {
    const monthNum = parseInt(month);
    if (monthNum <= 3) return '01';
    if (monthNum <= 6) return '02';
    if (monthNum <= 9) return '03';
    return '04';
  }
}