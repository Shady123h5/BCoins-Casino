import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getUser, addBalance } from "../data/db.js";
import {
  startMinesGame,
  revealCell,
  cashoutMines,
  getMinesMultiplier,
  activeMinesGames,
  clearGame,
  DIFFICULTY_CONFIG,
  GRID_COLS,
  GRID_ROWS,
  type MinesDifficulty,
} from "../games/mines.js";

export const data = new SlashCommandBuilder()
  .setName("mines")
  .setDescription("Play Mines — pick a difficulty and reveal safe tiles")
  .addIntegerOption((opt) =>
    opt.setName("bet").setDescription("Amount to bet").setRequired(true).setMinValue(1),
  );

// 4 rows × 5 cols = 20 tiles → 4 grid action rows + 1 cashout row = 5 max ✓
function buildGridComponents(userId: string): ActionRowBuilder<ButtonBuilder>[] {
  const game = activeMinesGames.get(userId);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let row = 0; row < GRID_ROWS; row++) {
    const actionRow = new ActionRowBuilder<ButtonBuilder>();
    for (let col = 0; col < GRID_COLS; col++) {
      const i = row * GRID_COLS + col;
      const revealed = game?.revealed[i] ?? false;
      const isMine = game?.grid[i] ?? false;

      let style = ButtonStyle.Secondary;
      let label = "⬜";
      const disabled = revealed || !game?.alive;

      if (revealed) {
        style = isMine ? ButtonStyle.Danger : ButtonStyle.Success;
        label = isMine ? "💥" : "💎";
      }

      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`mine_${i}`)
          .setLabel(label)
          .setStyle(style)
          .setDisabled(disabled),
      );
    }
    rows.push(actionRow);
  }

  // Row 5: cashout button
  const game2 = activeMinesGames.get(userId);
  const canCashout = (game2?.safeRevealed ?? 0) > 0 && game2?.alive;
  const mult = canCashout
    ? getMinesMultiplier(game2!.safeRevealed, game2!.mineCount)
    : 1;

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("mines_cashout")
        .setLabel(canCashout ? `💰 Cash Out  ×${mult.toFixed(2)}` : "💰 Cash Out")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!canCashout),
    ),
  );

  return rows; // exactly 5 rows total
}

function difficultySelectRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("diff_easy")
      .setLabel("🟢 Easy  —  3 💣")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("diff_medium")
      .setLabel("🟡 Medium  —  5 💣")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("diff_hard")
      .setLabel("🔴 Hard  —  7 💣")
      .setStyle(ButtonStyle.Danger),
  );
}

function gameEmbed(userId: string, bet: number, difficulty: MinesDifficulty): EmbedBuilder {
  const game = activeMinesGames.get(userId);
  const cfg = DIFFICULTY_CONFIG[difficulty];
  const safe = game?.safeRevealed ?? 0;
  const mult = getMinesMultiplier(safe, cfg.mines);
  const payout = Math.round(bet * mult);

  return new EmbedBuilder()
    .setColor(0xf5c518)
    .setTitle(`💣 Mines  —  ${cfg.emoji} ${cfg.label}`)
    .setDescription(`**${cfg.mines} mines** hidden across 20 tiles. Click to reveal!\nBet: **${bet.toLocaleString()} BCoins**`)
    .addFields(
      { name: "Revealed Safe", value: `${safe}`, inline: true },
      { name: "Multiplier",    value: `×${mult.toFixed(2)}`, inline: true },
      { name: "Payout",        value: `${payout.toLocaleString()} BCoins`, inline: true },
    )
    .setFooter({ text: "BCoins Casino • Mines" });
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const bet = interaction.options.getInteger("bet", true);
  const userId = interaction.user.id;

  // Block if already in a game
  if (activeMinesGames.get(userId)?.alive) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("❌ Game Already Active")
          .setDescription("You have an active Mines game. Finish it first."),
      ],
      ephemeral: true,
    });
  }

  const user = getUser(userId);
  if (user.balance < bet) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("❌ Insufficient Funds")
          .setDescription(`You only have **${user.balance.toLocaleString()} BCoins**.`),
      ],
      ephemeral: true,
    });
  }

  // Step 1: difficulty selection
  const selectEmbed = new EmbedBuilder()
    .setColor(0xf5c518)
    .setTitle("💣 Mines — Choose Difficulty")
    .setDescription(`Bet: **${bet.toLocaleString()} BCoins**\n\nPick a difficulty to start:`)
    .addFields(
      { name: "🟢 Easy",   value: "3 mines · lower risk · lower rewards",  inline: false },
      { name: "🟡 Medium", value: "5 mines · balanced risk & reward",        inline: false },
      { name: "🔴 Hard",   value: "7 mines · high risk · high rewards",      inline: false },
    )
    .setFooter({ text: "BCoins Casino • Mines" });

  const msg = await interaction.reply({
    embeds: [selectEmbed],
    components: [difficultySelectRow()],
    fetchReply: true,
  });

  // Step 2: wait for difficulty pick
  const diffCollector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === userId && i.customId.startsWith("diff_"),
    max: 1,
    time: 60_000,
  });

  diffCollector.on("collect", async (btn) => {
    const difficulty = btn.customId.replace("diff_", "") as MinesDifficulty;

    // Deduct bet
    addBalance(userId, -bet);
    startMinesGame(userId, bet, difficulty);

    await btn.update({
      embeds: [gameEmbed(userId, bet, difficulty)],
      components: buildGridComponents(userId),
    });

    // Step 3: main game collector
    const gameCollector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === userId,
      time: 300_000,
    });

    gameCollector.on("collect", async (gbtn) => {
      // ── CASHOUT ──────────────────────────────────────────────────────────
      if (gbtn.customId === "mines_cashout") {
        try {
          const { payout, multiplier } = cashoutMines(userId);
          addBalance(userId, payout);
          const finalBalance = getUser(userId).balance;
          const cfg = DIFFICULTY_CONFIG[difficulty];

          await gbtn.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle("💰 Cashed Out!")
                .setDescription(`You cashed out at **×${multiplier.toFixed(2)}**!`)
                .addFields(
                  { name: "Difficulty", value: `${cfg.emoji} ${cfg.label}`, inline: true },
                  { name: "Payout",     value: `+${payout.toLocaleString()} BCoins`, inline: true },
                  { name: "Balance",    value: `${finalBalance.toLocaleString()} BCoins`, inline: true },
                )
                .setFooter({ text: "BCoins Casino • Mines" })
                .setTimestamp(),
            ],
            components: [],
          });
          gameCollector.stop("cashout");
        } catch {
          await gbtn.reply({ content: "Cannot cash out right now.", ephemeral: true });
        }
        return;
      }

      // ── TILE REVEAL ───────────────────────────────────────────────────────
      if (gbtn.customId.startsWith("mine_")) {
        const cellIndex = parseInt(gbtn.customId.replace("mine_", ""), 10);
        try {
          const { hit, game: updatedGame } = revealCell(userId, cellIndex);
          const cfg = DIFFICULTY_CONFIG[difficulty];

          if (hit) {
            const finalBalance = getUser(userId).balance;
            // Reveal all mines in final grid display
            const revealComponents = buildGridComponents(userId);

            await gbtn.update({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xe74c3c)
                  .setTitle("💥 Boom! Mine Hit!")
                  .setDescription(`You hit a mine on ${cfg.emoji} **${cfg.label}** and lost **${bet.toLocaleString()} BCoins**.`)
                  .addFields(
                    { name: "Safe Tiles Revealed", value: `${updatedGame.safeRevealed}`, inline: true },
                    { name: "Lost",    value: `-${bet.toLocaleString()} BCoins`, inline: true },
                    { name: "Balance", value: `${finalBalance.toLocaleString()} BCoins`, inline: true },
                  )
                  .setFooter({ text: "BCoins Casino • Mines" })
                  .setTimestamp(),
              ],
              components: revealComponents,
            });
            gameCollector.stop("lost");
          } else {
            // Check if all safe tiles cleared
            const safeTiles = updatedGame.grid.filter((v) => !v).length;
            if (updatedGame.safeRevealed >= safeTiles) {
              // Perfect clear!
              const { payout, multiplier } = cashoutMines(userId);
              addBalance(userId, payout);
              const finalBalance = getUser(userId).balance;

              await gbtn.update({
                embeds: [
                  new EmbedBuilder()
                    .setColor(0xf5c518)
                    .setTitle("🏆 Perfect Clear!")
                    .setDescription(`You revealed every safe tile on ${cfg.emoji} **${cfg.label}**!`)
                    .addFields(
                      { name: "Multiplier", value: `×${multiplier.toFixed(2)}`, inline: true },
                      { name: "Payout",     value: `+${payout.toLocaleString()} BCoins`, inline: true },
                      { name: "Balance",    value: `${finalBalance.toLocaleString()} BCoins`, inline: true },
                    )
                    .setFooter({ text: "BCoins Casino • Mines" })
                    .setTimestamp(),
                ],
                components: [],
              });
              gameCollector.stop("perfect");
            } else {
              await gbtn.update({
                embeds: [gameEmbed(userId, bet, difficulty)],
                components: buildGridComponents(userId),
              });
            }
          }
        } catch (err) {
          // Clear stuck game state so they can play again
          clearGame(userId);
          await gbtn.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle("❌ Error")
                .setDescription("Something went wrong. Your bet has been refunded."),
            ],
            ephemeral: true,
          });
          addBalance(userId, bet);
          gameCollector.stop("error");
        }
      }
    });

    gameCollector.on("end", async (_, reason) => {
      if (!["cashout", "lost", "perfect", "error"].includes(reason)) {
        const currentGame = activeMinesGames.get(userId);
        if (currentGame?.alive) {
          if (currentGame.safeRevealed > 0) {
            const { payout, multiplier } = cashoutMines(userId);
            addBalance(userId, payout);
            await interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x95a5a6)
                  .setTitle("⌛ Timed Out — Auto Cashed Out")
                  .setDescription(`Cashed out at ×${multiplier.toFixed(2)}.`)
                  .addFields({ name: "Payout", value: `${payout.toLocaleString()} BCoins`, inline: true }),
              ],
              components: [],
            });
          } else {
            // Refund if nothing revealed
            clearGame(userId);
            addBalance(userId, bet);
            await interaction.editReply({
              embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("⌛ Timed Out").setDescription("Bet refunded.")],
              components: [],
            });
          }
        }
      }
    });
  });

  diffCollector.on("end", async (_, reason) => {
    if (reason === "time") {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("⌛ Timed Out").setDescription("No difficulty selected.")],
        components: [],
      });
    }
  });
}
