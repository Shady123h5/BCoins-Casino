import { getWinProbability } from "../data/db.js";

export interface MinesGame {
  grid: boolean[];
  revealed: boolean[];
  mineCount: number;
  safeRevealed: number;
  alive: boolean;
  bet: number;
  userId: string;
}

const GRID_SIZE = 25;

export const activeMinesGames = new Map<string, MinesGame>();

export function startMinesGame(userId: string, bet: number, mineCount: number): MinesGame {
  const grid: boolean[] = Array(GRID_SIZE).fill(false);
  const minePositions = new Set<number>();
  while (minePositions.size < mineCount) {
    minePositions.add(Math.floor(Math.random() * GRID_SIZE));
  }
  for (const pos of minePositions) {
    grid[pos] = true;
  }

  const game: MinesGame = {
    grid,
    revealed: Array(GRID_SIZE).fill(false),
    mineCount,
    safeRevealed: 0,
    alive: true,
    bet,
    userId,
  };

  activeMinesGames.set(userId, game);
  return game;
}

export function revealCell(userId: string, index: number): {
  hit: boolean;
  game: MinesGame;
} {
  const game = activeMinesGames.get(userId);
  if (!game || !game.alive) throw new Error("No active game");
  if (game.revealed[index]) throw new Error("Cell already revealed");

  const winProb = getWinProbability();

  let hit = game.grid[index];

  if (!hit && Math.random() > winProb) {
    const safeCells = game.grid
      .map((isMine, i) => (!isMine && !game.revealed[i] ? i : -1))
      .filter((i) => i !== -1 && i !== index);
    if (safeCells.length > 0 && game.safeRevealed > 0) {
      hit = Math.random() < (1 - winProb) * 0.4;
    }
  }

  if (hit) {
    game.grid[index] = true;
    game.revealed[index] = true;
    game.alive = false;
    activeMinesGames.set(userId, game);
    return { hit: true, game };
  }

  game.revealed[index] = true;
  game.safeRevealed += 1;
  activeMinesGames.set(userId, game);
  return { hit: false, game };
}

export function cashoutMines(userId: string): { payout: number; multiplier: number } {
  const game = activeMinesGames.get(userId);
  if (!game || !game.alive) throw new Error("No active game");

  const multiplier = getMinesMultiplier(game.safeRevealed, game.mineCount);
  const payout = Math.round(game.bet * multiplier);

  game.alive = false;
  activeMinesGames.set(userId, game);

  return { payout, multiplier };
}

export function getMinesMultiplier(safeRevealed: number, mineCount: number): number {
  if (safeRevealed === 0) return 1;
  const safeTotal = GRID_SIZE - mineCount;
  let multiplier = 1;
  for (let i = 0; i < safeRevealed; i++) {
    multiplier *= (safeTotal - i) / (GRID_SIZE - mineCount - i);
  }
  return Math.max(1, parseFloat((multiplier * 0.97).toFixed(2)));
}

export function renderMinesGrid(game: MinesGame, revealAll = false): string {
  const rows: string[] = [];
  for (let row = 0; row < 5; row++) {
    const cols: string[] = [];
    for (let col = 0; col < 5; col++) {
      const i = row * 5 + col;
      if (revealAll) {
        cols.push(game.grid[i] ? "💣" : "💎");
      } else if (game.revealed[i]) {
        cols.push(game.grid[i] ? "💥" : "✅");
      } else {
        cols.push("⬛");
      }
    }
    rows.push(cols.join(" "));
  }
  return rows.join("\n");
}
