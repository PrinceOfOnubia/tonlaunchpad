import type { Launch, Trade } from "@/types/launch";

export const launches: Launch[] = [
  {
    id: "blue-flame",
    name: "Blue Flame",
    ticker: "FLAME",
    description: "A TON-blue burner for memes that refuse to cool down.",
    imageTone: "flame",
    marketCapTon: 48210,
    priceTon: 0.00042,
    progress: 68,
    volumeTon: 12840,
    holders: 924,
    contract: "EQD7r9mTonicBlueFlameLaunch111111111111111111"
  },
  {
    id: "sipster",
    name: "Sipster",
    ticker: "SIP",
    description: "The meme tonic for TON.",
    imageTone: "potion",
    marketCapTon: 28750,
    priceTon: 0.00031,
    progress: 44,
    volumeTon: 7690,
    holders: 512,
    contract: "EQB4n8mTonicSipsterLaunch22222222222222222222"
  },
  {
    id: "send-elixir",
    name: "Send Elixir",
    ticker: "SEND",
    description: "Create. Sip. Send.",
    imageTone: "spark",
    marketCapTon: 19300,
    priceTon: 0.00018,
    progress: 31,
    volumeTon: 4188,
    holders: 337,
    contract: "EQC2a7mTonicSendElixir333333333333333333333"
  },
  {
    id: "tonic-wave",
    name: "Tonic Wave",
    ticker: "WAVE",
    description: "TON memes, launched instantly.",
    imageTone: "wave",
    marketCapTon: 12180,
    priceTon: 0.00012,
    progress: 22,
    volumeTon: 2194,
    holders: 188,
    contract: "EQD9v1mTonicWaveLaunch444444444444444444444"
  }
];

export const recentTrades: Trade[] = [
  { id: "t1", side: "buy", amountTon: 14.2, tokens: 33809, trader: "UQ9...2FA", time: "12s" },
  { id: "t2", side: "buy", amountTon: 4.8, tokens: 11428, trader: "EQ1...8BC", time: "46s" },
  { id: "t3", side: "sell", amountTon: 2.1, tokens: 5010, trader: "UQC...7AD", time: "1m" },
  { id: "t4", side: "buy", amountTon: 8.6, tokens: 20476, trader: "EQF...91E", time: "3m" }
];

export function getLaunch(id: string) {
  return launches.find((launch) => launch.id === id);
}

export function formatTon(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value < 1 ? 6 : 2
  }).format(value);
}
