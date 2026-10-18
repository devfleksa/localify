// Supported markets (docs/project.md).
export const MARKETS = [
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "TR", name: "Türkiye", flag: "🇹🇷" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
] as const;

export type MarketCode = (typeof MARKETS)[number]["code"];

export const market = (code: MarketCode) => MARKETS.find((m) => m.code === code)!;

export const isMarket = (code: string): code is MarketCode => MARKETS.some((m) => m.code === code);
