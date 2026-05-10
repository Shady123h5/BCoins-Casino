import { getWinProbability } from "../data/db.js";

export type CoinSide = "heads" | "tails";

export function playCoinflipVsBot(userChoice: CoinSide): {
  result: CoinSide;
  won: boolean;
} {
  const winProb = getWinProbability();
  const won = Math.random() < winProb;
  const result: CoinSide = won ? userChoice : (userChoice === "heads" ? "tails" : "heads");
  return { result, won };
}

export function playCoinflipPvP(): CoinSide {
  return Math.random() < 0.5 ? "heads" : "tails";
}
