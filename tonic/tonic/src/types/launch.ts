export type Launch = {
  id: string;
  name: string;
  ticker: string;
  description: string;
  imageTone: "flame" | "potion" | "spark" | "wave";
  marketCapTon: number;
  priceTon: number;
  progress: number;
  volumeTon: number;
  holders: number;
  contract: string;
};

export type Trade = {
  id: string;
  side: "buy" | "sell";
  amountTon: number;
  tokens: number;
  trader: string;
  time: string;
};
