export interface TokenPrices {
  input: number;
  cachedInput: number | null;
  output: number;
  cacheWrite?: number;
}

export interface PriceTier extends TokenPrices {
  longContext?: TokenPrices & { thresholdTokens: number };
}

export interface ModelPrice {
  effectiveFrom?: string;
  standard: PriceTier;
  batch: PriceTier | null;
}

export type PriceTable = Record<string, Record<string, ModelPrice[]>>;

const flat = (input: number, cachedInput: number | null, output: number, cacheWrite?: number): TokenPrices => ({
  input,
  cachedInput,
  output,
  ...(cacheWrite === undefined ? {} : { cacheWrite }),
});

const withLongContext = (base: TokenPrices, thresholdTokens: number, long: TokenPrices): PriceTier => ({
  ...base,
  longContext: { ...long, thresholdTokens },
});

const OPENAI_LONG_CONTEXT = 272_000;
const GEMINI_LONG_CONTEXT = 200_000;

const openAILong = (standard: [TokenPrices, TokenPrices], batch: [TokenPrices, TokenPrices] | null): ModelPrice[] => [
  {
    standard: withLongContext(standard[0], OPENAI_LONG_CONTEXT, standard[1]),
    batch: batch ? withLongContext(batch[0], OPENAI_LONG_CONTEXT, batch[1]) : null,
  },
];

const simple = (standard: TokenPrices, batch: TokenPrices | null): ModelPrice[] => [{ standard, batch }];

const geminiIntroductory = (): ModelPrice[] => [
  { standard: flat(0.75, 0.075, 3.75), batch: flat(0.375, 0.0375, 1.875) },
  { effectiveFrom: "2027-01-01", standard: flat(1.5, 0.15, 7.5), batch: flat(0.75, 0.075, 3.75) },
];

const anthropic = (input: number, cacheRead: number, output: number): ModelPrice[] =>
  simple(flat(input, cacheRead, output, input * 1.25), flat(input / 2, cacheRead / 2, output / 2, (input * 1.25) / 2));

const OPENAI_PRICES: Record<string, ModelPrice[]> = {
  "gpt-6-astra": openAILong(
    [flat(10, 1, 50, 12.5), flat(20, 2, 75, 25)],
    [flat(5, 0.5, 25, 6.25), flat(10, 1, 37.5, 12.5)]
  ),
  "gpt-6-sol": openAILong([flat(2, 0.2, 10, 2.5), flat(4, 0.4, 15, 5)], [flat(1, 0.1, 5, 1.25), flat(2, 0.2, 7.5, 2.5)]),
  "gpt-6-luna": openAILong(
    [flat(0.1, 0.01, 0.5, 0.125), flat(0.2, 0.02, 0.75, 0.25)],
    [flat(0.05, 0.005, 0.25, 0.0625), flat(0.1, 0.01, 0.375, 0.125)]
  ),
  "gpt-5.6-sol": openAILong([flat(4, 0.4, 20, 5), flat(8, 0.8, 30, 10)], [flat(2, 0.2, 10, 2.5), flat(4, 0.4, 15, 5)]),
  "gpt-5.6-terra": openAILong([flat(2, 0.2, 12, 2.5), flat(4, 0.4, 18, 5)], [flat(1, 0.1, 6, 1.25), flat(2, 0.2, 9, 2.5)]),
  "gpt-5.6-luna": openAILong(
    [flat(0.2, 0.02, 1.2, 0.25), flat(0.4, 0.04, 1.8, 0.5)],
    [flat(0.1, 0.01, 0.6, 0.125), flat(0.2, 0.02, 0.9, 0.25)]
  ),
  "gpt-5.5": openAILong([flat(5, 0.5, 30), flat(10, 1, 45)], [flat(2.5, 0.25, 15), flat(5, 0.5, 22.5)]),
  "gpt-5.5-pro": [
    { standard: withLongContext(flat(30, null, 180), OPENAI_LONG_CONTEXT, flat(60, null, 270)), batch: flat(15, null, 90) },
  ],
  "gpt-5.4": openAILong([flat(2.5, 0.25, 15), flat(5, 0.5, 22.5)], [flat(1.25, 0.125, 7.5), flat(2.5, 0.25, 11.25)]),
  "gpt-5.4-mini": simple(flat(0.75, 0.075, 4.5), flat(0.375, 0.0375, 2.25)),
  "gpt-5.4-nano": simple(flat(0.2, 0.02, 1.25), flat(0.1, 0.01, 0.625)),
  "gpt-5.2": simple(flat(1.75, 0.175, 14), flat(0.875, 0.0875, 7)),
  "gpt-5.2-pro": simple(flat(21, null, 168), flat(10.5, null, 84)),
  "gpt-5.1": simple(flat(1.25, 0.125, 10), flat(0.625, 0.0625, 5)),
  "gpt-5": simple(flat(1.25, 0.125, 10), flat(0.625, 0.0625, 5)),
  "gpt-5-mini": simple(flat(0.25, 0.025, 2), flat(0.125, 0.0125, 1)),
  "gpt-5-nano": simple(flat(0.05, 0.005, 0.4), flat(0.025, 0.0025, 0.2)),
  "gpt-5-pro": simple(flat(15, null, 120), flat(7.5, null, 60)),
  "gpt-4.1": simple(flat(2, 0.5, 8), flat(1, null, 4)),
  "gpt-4.1-mini": simple(flat(0.4, 0.1, 1.6), flat(0.2, null, 0.8)),
  "gpt-4.1-nano": simple(flat(0.1, 0.025, 0.4), flat(0.05, null, 0.2)),
  "o4-mini": simple(flat(1.1, 0.275, 4.4), flat(0.55, null, 2.2)),
  o3: simple(flat(2, 0.5, 8), flat(1, null, 4)),
  "o3-mini": simple(flat(1.1, 0.55, 4.4), flat(0.55, null, 2.2)),
  "o3-pro": simple(flat(20, null, 80), flat(10, null, 40)),
  o1: simple(flat(15, 7.5, 60), flat(7.5, null, 30)),
  "o1-pro": simple(flat(150, null, 600), flat(75, null, 300)),
  "gpt-4o": simple(flat(2.5, 1.25, 10), flat(1.25, null, 5)),
  "gpt-4o-mini": simple(flat(0.15, 0.075, 0.6), flat(0.075, null, 0.3)),
};

const GOOGLE_PRICES: Record<string, ModelPrice[]> = {
  "gemini-3.8-flash": geminiIntroductory(),
  "gemini-3.7-flash": geminiIntroductory(),
  "gemini-3.6-flash": geminiIntroductory(),
  "gemini-3.5-flash": simple(flat(1.5, 0.15, 9), flat(0.75, 0.075, 4.5)),
  "gemini-3.5-flash-lite": simple(flat(0.3, 0.03, 2.5), flat(0.15, 0.02, 1.25)),
  "gemini-3.1-pro-preview": [
    {
      standard: withLongContext(flat(2, 0.2, 12), GEMINI_LONG_CONTEXT, flat(4, 0.4, 18)),
      batch: withLongContext(flat(1, 0.2, 6), GEMINI_LONG_CONTEXT, flat(2, 0.4, 9)),
    },
  ],
  "gemini-3.1-flash-lite": simple(flat(0.25, 0.025, 1.5), flat(0.125, 0.0125, 0.75)),
  "gemini-3-flash-preview": simple(flat(0.5, 0.05, 3), flat(0.25, 0.05, 1.5)),
  "gemini-2.5-pro": [
    {
      standard: withLongContext(flat(1.25, 0.125, 10), GEMINI_LONG_CONTEXT, flat(2.5, 0.25, 15)),
      batch: withLongContext(flat(0.625, 0.125, 5), GEMINI_LONG_CONTEXT, flat(1.25, 0.25, 7.5)),
    },
  ],
  "gemini-2.5-flash": simple(flat(0.3, 0.03, 2.5), flat(0.15, 0.03, 1.25)),
  "gemini-2.5-flash-lite": simple(flat(0.1, 0.01, 0.4), flat(0.05, 0.01, 0.2)),
};

const ANTHROPIC_PRICES: Record<string, ModelPrice[]> = {
  "claude-fable-5-1": anthropic(10, 0.25, 50),
  "claude-opus-5-5": anthropic(4, 0.2, 20),
  "claude-opus-5": anthropic(5, 0.5, 25),
  "claude-sonnet-5-5": anthropic(2, 0.2, 10),
  "claude-sonnet-5": anthropic(2, 0.2, 10),
  "claude-haiku-4-5": anthropic(1, 0.1, 5),
};

export const PRICE_TABLE: PriceTable = {
  openai: OPENAI_PRICES,
  google: GOOGLE_PRICES,
  anthropic: ANTHROPIC_PRICES,
};
