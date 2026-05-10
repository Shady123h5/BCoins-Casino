import { getWinProbability } from "../data/db.js";

// 4 rows × 5 cols = 20 tiles → 4 grid rows + 1 cashout row = 5 total (Discord limit)
export const GRID_COLS = 5;
export const GRID_ROWS = 4;
export const GRID_SIZE = GRID_COLS * GRID_ROWS; // 20

export type MinesDifficulty = "easy" | "medium" | "hard";

export const DIFFICULTY_CONFIG: Record<MinesDifficulty, { mines: number; label: string; emoji: string }> = {
  easy:   { mines: 3, label: "Easy",   emoji: "🟢" },
  medium: { mines: 5, label: "Medium", emoji: "🟡" },
  hard:   { mines: 7, label: "Hard",   emoji: "🔴" },
};

export interface MinesGame {
  grid: boolean[];
  revealed: boolean[];
  mineCount: number;
  difficulty: MinesDifficulty;
  safeRevealed: number;
  alive: boolean;
  bet: number;
  userId: string;
}

export const activeMinesGames = new Map<string, MinesGame>();

export function startMinesGame(
  userId: string,
  bet: number,
  difficulty: MinesDifficulty,
): MinesGame {
  const { mines } = DIFFICULTY_CONFIG[difficulty];
  const grid: boolean[] = Array(GRID_SIZE).fill(false);
  const positions = new Set<number>();
  while (positions.size < mines) {
    positions.add(Math.floor(Math.random() * GRID_SIZE));
  }
  for (const pos of positions) grid[pos] = true;

  const game: MinesGame = {
    grid,
    revealed: Array(GRID_SIZE).fill(false),
    mineCount: mines,
    difficulty,
    safeRevealed: 0,
    alive: true,
    bet,
    userId,
  };
  activeMinesGames.set(userId, game);
  return game;
}

export function revealCell(
  userId: string,
  index: number,
): { hit: boolean; game: MinesGame } {
  const game = activeMinesGames.get(userId);
  if (!game || !game.alive) throw new Error("No active game");
  if (game.revealed[index]) throw new Error("Already revealed");

  // Rigging: only applies when win_probability != 0.5
  // At 0.5 the game is 100% fair per the grid layout
  const winProb = getWinProbability();
  let hit = game.grid[index];

  if (!hit && winProb < 0.5) {
    // House-favored: small chance a safe cell becomes a mine
    const rigChance = (0.5 - winProb) * 0.3;
    if (Math.random() < rigChance && game.safeRevealed > 0) {
      hit = true;
      game.grid[index] = true;
    }
  }

  game.revealed[index] = true;

  if (hit) {
    game.alive = false;
    activeMinesGames.set(userId, game);
    return { hit: true, game };
  }

  game.safeRevealed += 1;
  activeMinesGames.set(userId, game);
  return { hit: false, game };
}

export function cashoutMines(userId: string): { payout: number; multiplier: number } {
  const game = activeMinesGames.get(userId);
  if (!game || !game.alive || game.safeRevealed === 0)
    throw new Error("Cannot cash out");

  const multiplier = getMinesMultiplier(game.safeRevealed, game.mineCount);
  const payout = Math.round(game.bet * multiplier);
  game.alive = false;
  activeMinesGames.set(userId, game);
  return { payout, multiplier };
}

// Stake-accurate formula: C(N,k)/C(N-M,k) × 0.99 house edge
// = ∏(i=0 to k-1) [(N-i)/(N-M-i)] × 0.99
export function getMinesMultiplier(safeRevealed: number, mineCount: number): number {
  if (safeRevealed === 0) return 1;
  const N = GRID_SIZE; // 20
  const M = mineCount;
  let multiplier = 1;
  for (let i = 0; i < safeRevealed; i++) {
    multiplier *= (N - i) / (N - M - i);
  }
  return Math.max(1.01, parseFloat((multiplier * 0.99).toFixed(2)));
}

export function clearGame(userId: string): void {
  activeMinesGames.delete(userId);
}
