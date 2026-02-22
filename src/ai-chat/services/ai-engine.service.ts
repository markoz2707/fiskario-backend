import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AiResponse {
  content: string;
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
  model: string;
  isMock: boolean;
}

/**
 * System prompt defining the AI's persona as a Polish tax accountant.
 * Covers all major areas of Polish tax law relevant to small business owners.
 */
const SYSTEM_PROMPT = `Jestes doswiadczona polska ksiegowa (AI asystentka podatkowa) w aplikacji FISKARIO.
Pomagasz wlascicielom jednoosobowych dzialalnosci gospodarczych (JDG) w sprawach ksiegowo-podatkowych.

Twoje kompetencje obejmuja:

1. PODATEK DOCHODOWY (PIT):
   - Skala podatkowa (art. 27 ustawy o PIT): 12% do 120 000 zl, 32% powyzej
   - Podatek liniowy (art. 30c ustawy o PIT): 19% stawka
   - Ryczalt od przychodow ewidencjonowanych (ustawa z 20.11.1998 r.)
   - Karta podatkowa
   - Kwota wolna od podatku: 30 000 zl
   - Ulga dla klasy sredniej, ulga dla mlodych (do 26 r.z.), ulga na powrot, ulga dla rodzin 4+
   - Zaliczki miesieczne i kwartalne na PIT
   - Rozliczenie roczne: PIT-36, PIT-36L, PIT-28
   - Wspolne rozliczenie z malzonkiem

2. VAT (ustawa z 11.03.2004 r. o podatku od towarow i uslug):
   - Rejestracja VAT, zwolnienie podmiotowe (art. 113 - limit 200 000 zl)
   - Stawki VAT: 23%, 8%, 5%, 0%, zw., np.
   - JPK_V7M/V7K - struktura, terminy, korekty
   - KSeF (Krajowy System e-Faktur)
   - Mechanizm podzielonej platnosci (split payment)
   - GTU (Grupy Towarow i Uslug)
   - Odliczanie VAT naliczonego, proporcja, korekta roczna

3. ZUS (ustawa o systemie ubezpieczen spolecznych):
   - Ulga na start (6 miesiecy bez ZUS spolecznego)
   - Preferencyjny ZUS (24 miesiace - mala dzialalnosc)
   - Duzy ZUS (pelne skladki)
   - Skladka zdrowotna - zalezna od formy opodatkowania:
     * Skala/liniowy: 9% dochodu (min. 314,10 zl w 2024)
     * Ryczalt: zryczaltowana kwota zalezna od przychodu
   - Terminy platnosci: 5., 15. lub 20. dzien miesiaca
   - DRA, RCA, RSA - deklaracje rozliczeniowe

4. KPiR (Ksiega Przychodow i Rozchodow):
   - Kolumny 1-17 zgodnie z Rozporzadzeniem MF
   - Zasady kwalifikowania przychodow i kosztow
   - Remanent (spis z natury) - poczatkowy, koncowy, srodkoroczny
   - Dokumenty ksiegowe: faktury, rachunki, dowody wewnetrzne

5. SRODKI TRWALE I AMORTYZACJA:
   - Klasyfikacja Srodkow Trwalych (KST)
   - Metody amortyzacji: liniowa, degresywna, jednorazowa
   - Amortyzacja jednorazowa do 10 000 zl (art. 22d ustawy o PIT)
   - Stawki amortyzacji wg wykazu

6. TERMINY PODATKOWE:
   - VAT: do 25. dnia miesiaca nastepnego (JPK_V7M) lub kwartalu
   - PIT zaliczki: do 20. dnia miesiaca nastepnego
   - PIT roczny: do 30 kwietnia
   - PIT-28: do konca lutego
   - ZUS: 5./15./20. dzien miesiaca

7. ULGI PODATKOWE:
   - Ulga na dzieci (art. 27f ustawy o PIT)
   - Ulga internetowa
   - Ulga termomodernizacyjna
   - Ulga rehabilitacyjna
   - Ulga na IKZE
   - Darowizny (kosciol, OPP, krew)
   - IP Box (5% od dochodu z kwalifikowanego IP)

Zasady odpowiedzi:
- Odpowiadaj WYLACZNIE po polsku
- Podawaj konkretne przepisy prawne (art., ustawa, rozporzadzenie)
- Podawaj aktualne stawki i limity
- Jezeli nie jestes pewna odpowiedzi, zaznacz to wyraznie
- Nie udzielaj porad prawnych - jedynie informacje ksiegowo-podatkowe
- Formatuj odpowiedzi czytelnie, uzyj list i podpunktow
- Jesli pytanie dotyczy konkretnej firmy uzytkownika, odwoluj sie do danych z kontekstu
- Zawsze podkreslaj ze warto skonsultowac sie z doradca podatkowym w zlozonych przypadkach`;

@Injectable()
export class AiEngineService {
  private readonly logger = new Logger(AiEngineService.name);
  private openai: OpenAI | null = null;
  private readonly useMock: boolean;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.model = this.configService.get<string>('OPENAI_CHAT_MODEL') || 'gpt-4o-mini';
    this.useMock = !apiKey || this.configService.get<string>('USE_MOCK_AI_CHAT') === 'true';

    if (apiKey && !this.useMock) {
      this.openai = new OpenAI({ apiKey });
      this.logger.log(`AI Engine initialized with model: ${this.model}`);
    } else {
      this.logger.warn('AI Engine running in MOCK mode (no OPENAI_API_KEY or USE_MOCK_AI_CHAT=true)');
    }
  }

  /**
   * Generate an AI response based on conversation history and optional context.
   * Falls back to mock if no API key is configured.
   */
  async generateResponse(
    messages: ChatMessage[],
    context?: string,
  ): Promise<AiResponse> {
    if (this.useMock || !this.openai) {
      return this.generateMockResponse(messages);
    }

    try {
      const systemMessages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
      ];

      if (context) {
        systemMessages.push({
          role: 'system',
          content: `Kontekst firmy uzytkownika:\n${context}`,
        });
      }

      const allMessages = [...systemMessages, ...messages];

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: allMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: 0.3,
        max_tokens: 2000,
      });

      const choice = response.choices[0];
      const content = choice?.message?.content || 'Przepraszam, nie udalo sie wygenerowac odpowiedzi.';

      return {
        content,
        tokensUsed: {
          prompt: response.usage?.prompt_tokens || 0,
          completion: response.usage?.completion_tokens || 0,
          total: response.usage?.total_tokens || 0,
        },
        model: response.model,
        isMock: false,
      };
    } catch (error) {
      this.logger.error('OpenAI API call failed, falling back to mock', error);
      return this.generateMockResponse(messages);
    }
  }

  /**
   * Generate a mock response for development/testing when no OpenAI API key is available.
   * Provides contextually relevant placeholder responses based on keywords in the last message.
   */
  private generateMockResponse(messages: ChatMessage[]): AiResponse {
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === 'user');
    const query = lastUserMessage?.content?.toLowerCase() || '';

    let content: string;

    if (query.includes('vat') || query.includes('jpk')) {
      content = `[MOCK] Informacje o VAT:

Jako podatnik VAT czynny masz obowiazek:
1. Skladania JPK_V7M do 25. dnia miesiaca nastepnego za miesiac poprzedni
2. Stosowania prawidlowych stawek VAT (23%, 8%, 5%, 0%)
3. Wystawiania faktur zgodnie z art. 106a-106q ustawy o VAT

Limit zwolnienia podmiotowego wynosi 200 000 zl rocznie (art. 113 ustawy o VAT).

**Uwaga: To jest odpowiedz testowa (MOCK). Skonfiguruj klucz OPENAI_API_KEY aby uzyskac pelne odpowiedzi AI.**`;
    } else if (query.includes('zus') || query.includes('skladk')) {
      content = `[MOCK] Informacje o ZUS:

Skladki ZUS dla przedsiebiorcow w 2025 roku:
1. **Ulga na start** - brak skladek spolecznych przez 6 miesiecy
2. **Preferencyjny ZUS** - podstawa 30% minimalnego wynagrodzenia (24 miesiace)
3. **Pelny ZUS** - podstawa 60% prognozowanego przecietnego wynagrodzenia

Skladka zdrowotna:
- Skala podatkowa: 9% dochodu (min. ok. 314 zl/mies.)
- Podatek liniowy: 4,9% dochodu (min. ok. 314 zl/mies.)
- Ryczalt: zryczaltowana kwota zalezna od progu przychodu

Terminy platnosci: do 20. dnia miesiaca (JDG bez pracownikow).

**Uwaga: To jest odpowiedz testowa (MOCK). Skonfiguruj klucz OPENAI_API_KEY aby uzyskac pelne odpowiedzi AI.**`;
    } else if (query.includes('pit') || query.includes('podatek') || query.includes('dochodow')) {
      content = `[MOCK] Informacje o podatku dochodowym (PIT):

Formy opodatkowania JDG:
1. **Skala podatkowa** - 12% do 120 000 zl, 32% powyzej (kwota wolna 30 000 zl)
2. **Podatek liniowy** - 19% (brak kwoty wolnej, brak ulgi na dzieci)
3. **Ryczalt** - stawki 2%-17% w zaleznosci od rodzaju dzialalnosci
4. **Karta podatkowa** - stala kwota ustalona przez US

Terminy:
- Zaliczki miesieczne: do 20. dnia nastepnego miesiaca
- PIT-36/PIT-36L: do 30 kwietnia roku nastepnego
- PIT-28: do konca lutego roku nastepnego

**Uwaga: To jest odpowiedz testowa (MOCK). Skonfiguruj klucz OPENAI_API_KEY aby uzyskac pelne odpowiedzi AI.**`;
    } else if (query.includes('kpir') || query.includes('ksieg') || query.includes('ksiazk')) {
      content = `[MOCK] Informacje o KPiR:

Ksiega Przychodow i Rozchodow (KPiR) zawiera 17 kolumn:
- Kol. 1: Lp.
- Kol. 2: Data zdarzenia gospodarczego
- Kol. 3: Nr dowodu ksiegowego
- Kol. 7: Przychod ze sprzedazy
- Kol. 8: Pozostale przychody
- Kol. 10: Zakup towarow/materialow
- Kol. 12: Wynagrodzenia
- Kol. 13: Pozostale wydatki
- Kol. 14: Razem wydatki

Pamietaj o remanencie (spis z natury) na poczatku i koniec roku podatkowego.

**Uwaga: To jest odpowiedz testowa (MOCK). Skonfiguruj klucz OPENAI_API_KEY aby uzyskac pelne odpowiedzi AI.**`;
    } else if (query.includes('faktur') || query.includes('ksef')) {
      content = `[MOCK] Informacje o fakturach i KSeF:

Krajowy System e-Faktur (KSeF) to system MF do wystawiania faktur ustrukturyzowanych.
- Obowiazek korzystania z KSeF: planowany od 2026 roku
- Faktura ustrukturyzowana ma format XML zgodny ze schema FA(2)

Elementy obowiazkowe faktury (art. 106e ustawy o VAT):
1. Data wystawienia i numer
2. Dane sprzedawcy i nabywcy (nazwa, NIP, adres)
3. Opis towarow/uslug
4. Kwoty netto, VAT, brutto
5. Stawka VAT

**Uwaga: To jest odpowiedz testowa (MOCK). Skonfiguruj klucz OPENAI_API_KEY aby uzyskac pelne odpowiedzi AI.**`;
    } else {
      content = `[MOCK] Dzien dobry! Jestem Twoja AI asystentka ksiegowa w FISKARIO.

Moge pomoc Ci w nastepujacych tematach:
- **Podatki** (PIT, VAT, ryczalt, skala podatkowa, podatek liniowy)
- **ZUS** (skladki, ulga na start, preferencyjny ZUS, skladka zdrowotna)
- **KPiR** (ksiegowanie, kolumny, remanent)
- **Faktury** (wystawianie, KSeF, JPK)
- **Amortyzacja** (srodki trwale, stawki, metody)
- **Terminy** (deklaracje, platnosci, rozliczenia roczne)
- **Ulgi podatkowe** (na dzieci, internetowa, termomodernizacyjna)

Zadaj pytanie, a postaram sie pomoc!

**Uwaga: To jest odpowiedz testowa (MOCK). Skonfiguruj klucz OPENAI_API_KEY aby uzyskac pelne odpowiedzi AI.**`;
    }

    return {
      content,
      tokensUsed: {
        prompt: 0,
        completion: 0,
        total: 0,
      },
      model: 'mock',
      isMock: true,
    };
  }
}
