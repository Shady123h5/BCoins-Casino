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
  TOWER_ROWS,
  TOWER_COLS,
} from "../games/towers.js";

export const data = new SlashCommandBuilder()
  .setName("towers")
  .setDescription("Climb the Towers — choose 1 safe tile per row to ascend!")
  .addIntegerOption((opt) =>
    opt.setName("bet").setDescription("Amount to bet").setRequired(true).setMinValue(1),
  );

function buildTowerButtons(userId: string): ActionRowBuilder<ButtonBuilder>[] {
  const game = activeTowersGames.get(userId);
  if (!game) return [];

  const labels = ["Left", "Middle", "Right"];
  const row = new ActionRowBuilder<ButtonBuilder>();

  for (let col = 0; col < TOWER_COLS; col++) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`tower_${col}`)
        .setLabel(labels[col])
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!game.alive || game.currentRow >= TOWER_ROWS),
    );
  }

  const cashoutRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("towers_cashout")
      .setLabel(
        game.currentRow > 0
          ? `💰 Cash Out (×${getTowersMultiplier(game.currentRow).toFixed(2)})`
          : "💰 Cash Out",
      )
      .setStyle(ButtonStyle.Success)
      .setDisabled(!game.alive || game.currentRow === 0),
  );

  return [row, cashoutRow];
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
          .setDescription("You already have an active Towers game!"),
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
  const game = startTowersGame(userId, bet);

  const embed = () => {
    const g = activeTowersGames.get(userId) ?? game;
    return new EmbedBuilder()
      .setColor(0xf5c518)
      .setTitle("🗼 Towers")
      .setDescription(
        `Choose the safe tile on each row to climb higher!\n\n${renderTowersGrid(g)}\n\nBet: **${bet.toLocaleString()} BCoins**`,
      )
      .addFields(
        { name: "Current Level", value: `${g.currentRow} / ${TOWER_ROWS}`, inline: true },
        { name: "Multiplier", value: `×${getTowersMultiplier(g.currentRow).toFixed(2)}`, inline: true },
        { name: "Payout", value: `${Math.round(bet * getTowersMultiplier(g.currentRow)).toLocaleString()} BCoins`, inline: true },
      )
      .setFooter({ text: "BCoins Casino • Towers" });
  };

  const msg = await interaction.reply({
    embeds: [embed()],
    components: buildTowerButtons(userId),
    fetchReply: true,
  });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === userId,
    time: 300000,
  });

  collector.on("collect", async (btn) => {
    if (btn.customId === "towers_cashout") {
      try {
        const { payout, multiplier } = cashoutTowers(userId);
        addBalance(userId, payout);
        const finalBalance = getUser(userId).balance;
        const g = activeTowersGames.get(userId)!;

        await btn.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ecc71)
              .setTitle("💰 Cashed Out!")
              .setDescription(
                `You cashed out at **×${multiplier.toFixed(2)}**!\n\n${renderTowersGrid(g)}`,
              )
              .addFields(
                { name: "Payout", value: `+${payout.toLocaleString()} BCoins`, inline: true },
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

    if (btn.customId.startsWith("tower_")) {
      const col = parseInt(btn.customId.replace("tower_", ""));
      try {
        const { hit, game: updatedGame } = chooseTowerCell(userId, col);

        if (hit) {
          const finalBalance = getUser(userId).balance;
          await btn.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle("💥 You Hit a Mine!")
                .setDescription(
                  `You fell off the tower and lost **${bet.toLocaleString()} BCoins**.\n\n${renderTowersGrid(updatedGame, true)}`,
                )
                .addFields(
                  { name: "Lost", value: `-${bet.toLocaleString()} BCoins`, inline: true },
                  { name: "Balance", value: `${finalBalance.toLocaleString()} BCoins`, inline: true },
                )
                .setFooter({ text: "BCoins Casino • Towers" })
                .setTimestamp(),
            ],
            components: [],
          });
          collector.stop("lost");
        } else if (updatedGame.currentRow >= TOWER_ROWS) {
          const { payout, multiplier } = cashoutTowers(userId);
          addBalance(userId, payout);
          const finalBalance = getUser(userId).balance;

          await btn.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0xf5c518)
                .setTitle("🏆 You Reached the Top!")
                .setDescription(
                  `Amazing! Full clear at **×${multiplier.toFixed(2)}**!\n\n${renderTowersGrid(updatedGame)}`,
                )
                .addFields(
                  { name: "Payout", value: `+${payout.toLocaleString()} BCoins`, inline: true },
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
            embeds: [embed()],
            components: buildTowerButtons(userId),
          });
        }
      } catch {
        await btn.reply({ content: "Something went wrong.", ephemeral: true });
      }
    }
  });

  collector.on("end", async (_, reason) => {
    if (!["cashout", "lost", "won"].includes(reason)) {
      const g = activeTowersGames.get(userId);
      if (g?.alive && g.currentRow > 0) {
        const { payout, multiplier } = cashoutTowers(userId);
        addBalance(userId, payout);
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x95a5a6)
              .setTitle("⌛ Game Timed Out — Auto Cashed Out")
              .setDescription(`Auto cashed out at ×${multiplier.toFixed(2)}.`)
              .addFields({ name: "Payout", value: `${payout.toLocaleString()} BCoins` }),
          ],
          components: [],
        });
      } else if (g?.alive) {
        addBalance(userId, bet);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("⌛ Game Timed Out").setDescription("Bet refunded.")], components: [] });
      }
    }
  });
}
