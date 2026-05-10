import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const DB_PATH = join(process.cwd(), "bcoin-data.json");

interface UserData {
  balance: number;
  totalWon: number;
  totalLost: number;
  gamesPlayed: number;
}

interface Database {
  users: Record<string, UserData>;
  winProbability: number;
}

function loadDb(): Database {
  if (!existsSync(DB_PATH)) {
    const initial: Database = { users: {}, winProbability: 0.5 };
    writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(readFileSync(DB_PATH, "utf-8")) as Database;
}

function saveDb(db: Database): void {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function getUser(userId: string): UserData {
  const db = loadDb();
  if (!db.users[userId]) {
    db.users[userId] = { balance: 0, totalWon: 0, totalLost: 0, gamesPlayed: 0 };
    saveDb(db);
  }
  return db.users[userId];
}

export function setBalance(userId: string, amount: number): void {
  const db = loadDb();
  if (!db.users[userId]) {
    db.users[userId] = { balance: 0, totalWon: 0, totalLost: 0, gamesPlayed: 0 };
  }
  db.users[userId].balance = Math.max(0, Math.round(amount));
  saveDb(db);
}

export function addBalance(userId: string, amount: number): number {
  const db = loadDb();
  if (!db.users[userId]) {
    db.users[userId] = { balance: 0, totalWon: 0, totalLost: 0, gamesPlayed: 0 };
  }
  db.users[userId].balance = Math.max(0, Math.round(db.users[userId].balance + amount));
  if (amount > 0) {
    db.users[userId].totalWon += amount;
  } else {
    db.users[userId].totalLost += Math.abs(amount);
  }
  db.users[userId].gamesPlayed += 1;
  saveDb(db);
  return db.users[userId].balance;
}

export function getWinProbability(): number {
  return loadDb().winProbability;
}

export function setWinProbability(prob: number): void {
  const db = loadDb();
  db.winProbability = Math.max(0, Math.min(1, prob));
  saveDb(db);
}

export function getLeaderboard(limit = 10): Array<{ userId: string; balance: number }> {
  const db = loadDb();
  return Object.entries(db.users)
    .sort(([, a], [, b]) => b.balance - a.balance)
    .slice(0, limit)
    .map(([userId, data]) => ({ userId, balance: data.balance }));
}
