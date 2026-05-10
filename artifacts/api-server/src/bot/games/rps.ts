import { getWinProbability } from "../data/db.js";

export type RPSChoice = "rock" | "paper" | "scissors";

const beats: Record<RPSChoice, RPSChoice> = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

const losesTo: Record<RPSChoice, RPSChoice> = {
  rock: "paper",
  paper: "scissors",
  scissors: "rock",
};

export type RPSResult = "win" | "loss" | "tie";

export function playRPSVsBot(userChoice: RPSChoice): {
  botChoice: RPSChoice;
  result: RPSResult;
} {
  const winProb = getWinProbability();
  const rand = Math.random();

  let botChoice: RPSChoice;

  if (rand < winProb) {
    botChoice = beats[userChoice];
  } else if (rand < winProb + (1 - winProb) * 0.5) {
    botChoice = losesTo[userChoice];
  } else {
    botChoice = userChoice;
  }

  let result: RPSResult;
  if (botChoice === userChoice) {
    result = "tie";
  } else if (beats[userChoice] === botChoice) {
    result = "win";
  } else {
    result = "loss";
  }

  return { botChoice, result };
}

export function playRPSPvP(
  player1Choice: RPSChoice,
  player2Choice: RPSChoice,
): RPSResult {
  if (player1Choice === player2Choice) return "tie";
  return beats[player1Choice] === player2Choice ? "win" : "loss";
}

export const rpsEmoji: Record<RPSChoice, string> = {
  rock: "🪨",
  paper: "📄",
  scissors: "✂️",
};
