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
  startTowersGame,
  chooseTowerCell,
  cashoutTowers,
  getTowersMultiplier,
  renderTowersGrid,
  activeTowersGames,
  clearTowersGame,
  TOWER_ROWS,
  TOWER_COLS,
} from "../games/towers.js";

export const data = new SlashCommandBuilder()
  .setName("towers")
  .setDescription("Climb the Towers — pick the safe tile on each row")
  .addIntegerOption((opt) =>
    opt.setName("bet").setDescription("Amount to bet").setRequired(true).setMinValue(1),
  );

function buildTowerComponents(userId: string, bet: number): ActionRowBuilder<ButtonBuilder>[] {
  const game = activeTowersGames.get(userId);
  const labels = ["⬅️ Left", "⬆️ Mid", "➡️ Right"];

  const pickRow = new ActionRowBuilder<ButtonBuilder>();
  for (let col = 0; col < TOWER_COLS; col++) {
    pickRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`tower_${col}`)
        .setLabel(labels[col])
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!game?.alive || (game?.currentRow ?? 0) >= TOWER_ROWS),
    );
  }

  const level = game?.currentRow ?? 0;
  const mult = getTowersMultiplier(level);
  const payout = Math.round(bet * mult);
  const canCashout = (game?.alive ?? false) && level > 0;

  const cashRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("towers_cashout")
      .setLabel(canCashout ? `💰 Cash Out  ×${mult.toFixed(2)}  (${payout.toLocaleString()})` : "💰 Cash Out")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canCashout),
  );

  return [pickRow, cashRow];
}

function towersEmbed(userId: string, bet: number): EmbedBuilder {
  const game = activeTowersGames.get(userId);
  const level = game?.currentRow ?? 0;
  const mult = getTowersMultiplier(level);
  const payout = Math.round(bet * mult);

  return new EmbedBuilder()
    .setColor(0xf5c518)
    .setTitle("🗼 Towers")
    .setDescription(
      `Pick the safe tile each row to climb higher!\n\n${renderTowersGrid(game!)}\n\nBet: **${bet.toLocaleString()} BCoins**`,
    )
    .addFields(
      { name: "Level",      value: `${level} / ${TOWER_ROWS}`, inline: true },
      { name: "Multiplier", value: `×${mult.toFixed(2)}`,       inline: true },
      { name: "Payout",     value: `${payout.toLocaleString()} BCoins`, inline: true },
    )
    .setFooter({ text: "BCoins Casino • Towers  |  3 tiles, 1 mine per row" });
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const bet = interaction.options.getInteger("bet", true);
  const userId = interaction.user.id;

  if (activeTowersGames.get(userId)?.alive) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("❌ Game Already Active")
          .setDescription("You have an active Towers game. Finish it first."),
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

  addBalance(userId, -bet);
  startTowersGame(userId, bet);

  const msg = await interaction.reply({
    embeds: [towersEmbed(userId, bet)],
    components: buildTowerComponents(userId, bet),
    fetchReply: true,
  });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === userId,
    time: 300_000,
  });

  collector.on("collect", async (btn) => {
    // ── CASHOUT ────────────────────────────────────────────────────────────
    if (btn.customId === "towers_cashout") {
      try {
        const { payout, multiplier } = cashoutTowers(userId);
        addBalance(userId, payout);
        const finalBalance = getUser(userId).balance;
        const game = activeTowersGames.get(userId)!;

        await btn.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ecc71)
              .setTitle("💰 Cashed Out!")
              .setDescription(`Cashed out at **×${multiplier.toFixed(2)}**!\n\n${renderTowersGrid(game)}`)
              .addFields(
                { name: "Level",   value: `${game.currentRow} / ${TOWER_ROWS}`, inline: true },
                { name: "Payout",  value: `+${payout.toLocaleString()} BCoins`, inline: true },
                { name: "Balance", value: `${finalBalance.toLocaleString()} BCoins`, inline: true },
              )
              .setFooter({ text: "BCoins Casino • Towers" })
              .setTimestamp(),
          ],
          components: [],
        });
        collector.stop("cashout");
      } catch {
        await btn.reply({ content: "Cannot cash out right now.", ephemeral: true });
      }
      return;
    }

    // ── TILE PICK ──────────────────────────────────────────────────────────
    if (btn.customId.startsWith("tower_")) {
      const col = parseInt(btn.customId.replace("tower_", ""), 10);
      try {
        const { hit, game: updatedGame } = chooseTowerCell(userId, col);

        if (hit) {
          const finalBalance = getUser(userId).balance;
          await btn.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle("💥 Mine Hit! You Fell!")
                .setDescription(
                  `You hit a mine on level **${updatedGame.currentRow + 1}** and lost **${bet.toLocaleString()} BCoins**.\n\n${renderTowersGrid(updatedGame, true)}`,
                )
                .addFields(
                  { name: "Lost",    value: `-${bet.toLocaleString()} BCoins`, inline: true },
                  { name: "Balance", value: `${finalBalance.toLocaleString()} BCoins`, inline: true },
                )
                .setFooter({ text: "BCoins Casino • Towers" })
                .setTimestamp(),
            ],
            components: [],
          });
          collector.stop("lost");
        } else if (updatedGame.currentRow >= TOWER_ROWS) {
          // Reached the top — auto cashout
          const { payout, multiplier } = cashoutTowers(userId);
          addBalance(userId, payout);
          const finalBalance = getUser(userId).balance;

          await btn.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0xf5c518)
                .setTitle("🏆 You Reached the Top!")
                .setDescription(
                  `Full clear at **×${multiplier.toFixed(2)}**!\n\n${renderTowersGrid(updatedGame)}`,
                )
                .addFields(
                  { name: "Payout",  value: `+${payout.toLocaleString()} BCoins`, inline: true },
                  { name: "Balance", value: `${finalBalance.toLocaleString()} BCoins`, inline: true },
                )
                .setFooter({ text: "BCoins Casino • Towers" })
                .setTimestamp(),
            ],
            components: [],
          });
          collector.stop("won");
        } else {
          await btn.update({
            embeds: [towersEmbed(userId, bet)],
            components: buildTowerComponents(userId, bet),
          });
        }
      } catch (err) {
        clearTowersGame(userId);
        addBalance(userId, bet);
        await btn.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle("❌ Error")
              .setDescription("Something went wrong. Your bet has been refunded."),
          ],
          ephemeral: true,
        });
        collector.stop("error");
      }
    }
  });

  collector.on("end", async (_, reason) => {
    if (!["cashout", "lost", "won", "error"].includes(reason)) {
      const g = activeTowersGames.get(userId);
      if (g?.alive) {
        if (g.currentRow > 0) {
          const { payout, multiplier } = cashoutTowers(userId);
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
          clearTowersGame(userId);
          addBalance(userId, bet);
          await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("⌛ Timed Out").setDescription("Bet refunded.")],
            components: [],
          });
        }
      }
    }
  });
}
