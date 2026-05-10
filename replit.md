# BCoins Casino Bot

A full-featured Discord.js v14 casino bot with a rigging system, multiple games, and an Express keep-alive server.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server + Discord bot (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- Required env secrets: `BOT_TOKEN`, `OWNER_SECRET_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Discord.js v14
- API: Express 5 (keep-alive server)
- Data: JSON file (`bcoin-data.json`) via `src/bot/data/db.ts`
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/bot/` — all bot code
  - `commands/` — individual slash command files
  - `games/` — game logic (coinflip, rps, mines, towers)
  - `data/db.ts` — lightweight JSON database for balances
- `artifacts/api-server/src/index.ts` — entry point (starts Express + Discord bot)
- `bcoin-data.json` — runtime data file (auto-created, gitignore-able)

## Architecture decisions

- Bot runs inside the same Express process so the single Replit workflow keeps both alive.
- Win probability is stored in the JSON DB so it persists across restarts.
- All PvP games use Discord button collectors with ephemeral intermediate messages for a clean UX.
- The rigging system influences only Player vs Bot games — PvP is always 50/50 fair.
- Slash commands are registered globally on every bot startup (Discord caches them).

## Product

### Economy commands
- `/balance [user]` — Check BCoins balance and stats
- `/daily` — Claim 500 free BCoins (24h cooldown)
- `/leaderboard` — Top 10 BCoins holders

### Games
- `/cf bot <amount> <side>` — Coinflip vs house (riggable)
- `/cf player <user> <amount>` — PvP coinflip with button accept/decline
- `/rps bot <choice> <amount>` — Rock Paper Scissors vs house (riggable)
- `/rps player <user> <amount>` — PvP RPS with secret button picks
- `/mines <bet> <mines>` — 5×5 Mines with interactive grid buttons & cash-out
- `/towers <bet>` — 8-level tower climb, 1 mine per row, cash-out at any level

### Owner panel
- `/owner-settings <secret_key> [win_probability]` — View/set house edge (0.0–1.0)
- `/give <secret_key> <user> <amount>` — Grant or remove BCoins from any user
- `/help` — Full command reference

## User preferences

- Keep all embed messages clean and professional
- Use environment secrets for BOT_TOKEN and OWNER_SECRET_KEY

## Gotchas

- Slash commands register globally — Discord may take up to 1 hour to propagate to all servers on first deploy.
- The `bcoin-data.json` file is created automatically at the project root on first run.
- The `ready` event deprecation warning (renamed to `clientReady` in v15) is harmless.
- `win_probability` of `0.5` = fair, `0.3` = house wins 70%, `0.7` = players win 70%.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
