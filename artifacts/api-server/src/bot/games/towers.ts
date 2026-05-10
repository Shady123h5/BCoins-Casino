import { getWinProbability } from "../data/db.js";

export const TOWER_ROWS = 8;
export const TOWER_COLS = 3;

export interface TowersGame {
  grid: boolean[][];
  revealed: boolean[][];
  currentRow: number;
  alive: boolean;
  bet: number;
  userId: string;
}

export const activeTowersGames = new Map<string, TowersGame>();

function buildGrid(): boolean[][] {
  const grid: boolean[][] = [];
  for (let row = 0; row < TOWER_ROWS; row++) {
    const mineCol = Math.floor(Math.random() * TOWER_COLS);
    const rowArr = Array(TOWER_COLS).fill(false) as boolean[];
    rowArr[mineCol] = true;
    grid.push(rowArr);
  }
  return grid;
}

export function startTowersGame(userId: string, bet: number): TowersGame {
  const game: TowersGame = {
    grid: buildGrid(),
    revealed: Array.from({ length: TOWER_ROWS }, () =>
      Array(TOWER_COLS).fill(false) as boolean[],
    ),
    currentRow: 0,
    alive: true,
    bet,
    userId,
  };
  activeTowersGames.set(userId, game);
  return game;
}

export function chooseTowerCell(
  userId: string,
  col: number,
): { hit: boolean; game: TowersGame } {
  const game = activeTowersGames.get(userId);
  if (!game || !game.alive) throw new Error("No active towers game");
  if (game.currentRow >= TOWER_ROWS) throw new Error("Already at top");

  const winProb = getWinProbability();
  let hit = game.grid[game.currentRow][col];

  // Rigging: only when owner has tilted win_probability
  if (!hit && winProb < 0.5) {
    const rigChance = (0.5 - winProb) * 0.25;
    if (Math.random() < rigChance && game.currentRow > 0) {
      hit = true;
      game.grid[game.currentRow] = Array(TOWER_COLS).fill(false) as boolean[];
      game.grid[game.currentRow][col] = true;
    }
  }

  game.revealed[game.currentRow][col] = true;

  if (hit) {
    game.alive = false;
    activeTowersGames.set(userId, game);
    return { hit: true, game };
  }

  game.currentRow += 1;
  activeTowersGames.set(userId, game);
  return { hit: false, game };
}

export function cashoutTowers(userId: string): {
  payout: number;
  multiplier: number;
} {
  const game = activeTowersGames.get(userId);
  if (!game || !game.alive || game.currentRow === 0)
    throw new Error("No active game to cash out");

  const multiplier = getTowersMultiplier(game.currentRow);
  const payout = Math.round(game.bet * multiplier);
  game.alive = false;
  activeTowersGames.set(userId, game);
  return { payout, multiplier };
}

// Stake-accurate: 3 tiles, 1 mine per row → P(safe) = 2/3
// Fair mult per row = 3/2 = 1.5. With 1% house edge: 1.485 per row.
// After k rows: 1.485^k
export function getTowersMultiplier(level: number): number {
  if (level === 0) return 1;
  return parseFloat(Math.pow(1.485, level).toFixed(2));
}

export function renderTowersGrid(game: TowersGame, revealAll = false): string {
  const rows: string[] = [];
  for (let row = TOWER_ROWS - 1; row >= 0; row--) {
    const isCurrentRow = row === game.currentRow && game.alive;
    const cols: string[] = [];
    for (let col = 0; col < TOWER_COLS; col++) {
      if (revealAll && row <= game.currentRow) {
        cols.push(game.grid[row][col] ? "💣" : "💎");
      } else if (game.revealed[row][col]) {
        cols.push(game.grid[row][col] ? "💥" : "✅");
      } else if (isCurrentRow) {
        cols.push("🟨");
      } else if (row < game.currentRow) {
        cols.push("✅");
      } else {
        cols.push("⬛");
      }
    }
    const mult = `×${getTowersMultiplier(row + 1).toFixed(2)}`;
    rows.push(`\`${mult.padStart(6)}\` ${cols.join(" ")}`);
  }
  return rows.join("\n");
}

export function clearTowersGame(userId: string): void {
  activeTowersGames.delete(userId);
}
