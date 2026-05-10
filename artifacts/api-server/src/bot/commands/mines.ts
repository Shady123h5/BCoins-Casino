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
  renderMinesGrid,
  activeMinesGames,
} from "../games/mines.js";

export const data = new SlashCommandBuilder()
  .setName("mines")
  .setDescription("Play Mines on a 5x5 grid")
  .addIntegerOption((opt) =>
    opt
      .setName("bet")
      .setDescription("Amount to bet")
      .setRequired(true)
      .setMinValue(1),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("mines")
      .setDescription("Number of mines (1-24)")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(24),
  );

function buildGridButtons(userId: string): ActionRowBuilder<ButtonBuilder>[] {
  const game = activeMinesGames.get(userId);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let row = 0; row < 5; row++) {
    const actionRow = new ActionRowBuilder<ButtonBuilder>();
    for (let col = 0; col < 5; col++) {
      const i = row * 5 + col;
      const revealed = game?.revealed[i];
      const isMine = game?.grid[i];
      let style = ButtonStyle.Secondary;
      let label = "⬛";
      let disabled = false;

      if (revealed) {
        if (isMine) {
          style = ButtonStyle.Danger;
          label = "💥";
        } else {
          style = ButtonStyle.Success;
          label = "✅";
        }
        disabled = true;
      }

      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`mine_${i}`)
          .setLabel(label)
          .setStyle(style)
          .setDisabled(disabled || !game?.alive),
      );
    }
    rows.push(actionRow);
  }
  return rows;
}

function buildCashoutRow(userId: string): ActionRowBuilder<ButtonBuilder> {
  const game = activeMinesGames.get(userId);
  const canCashout = (game?.safeRevealed ?? 0) > 0 && game?.alive;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("mines_cashout")
      .setLabel(canCashout ? `💰 Cash Out (×${getMinesMultiplier(game!.safeRevealed, game!.mineCount).toFixed(2)})` : "💰 Cash Out")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!canCashout),
  );
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const bet = interaction.options.getInteger("bet", true);
  const mineCount = interaction.options.getInteger("mines", true);
  const userId = interaction.user.id;

  if (activeMinesGames.get(userId)?.alive) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("❌ Game Already Active")
          .setDescription("You already have an active Mines game! Finish it first."),
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
  const game = startMinesGame(userId, bet, mineCount);

  const embed = new EmbedBuilder()
    .setColor(0xf5c518)
    .setTitle("💣 Mines")
    .setDescription(
      `**${mineCount} mines** hidden in the grid. Click tiles to reveal safe spots!\n\nBet: **${bet.toLocaleString()} BCoins**`,
    )
    .addFields(
      { name: "Safe Revealed", value: "0", inline: true },
      { name: "Multiplier", value: "×1.00", inline: true },
      { name: "Current Payout", value: `${bet} BCoins`, inline: true },
    )
    .setFooter({ text: "BCoins Casino • Mines" });

  const components = [...buildGridButtons(userId), buildCashoutRow(userId)];

  const msg = await interaction.reply({
    embeds: [embed],
    components,
    fetchReply: true,
  });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === userId,
    time: 300000,
  });

  collector.on("collect", async (btn) => {
    if (btn.customId === "mines_cashout") {
      try {
        const { payout, multiplier } = cashoutMines(userId);
        addBalance(userId, payout);
        const finalBalance = getUser(userId).balance;

        await btn.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ecc71)
              .setTitle("💰 Cashed Out!")
              .setDescription(
                `You cashed out at **×${multiplier.toFixed(2)}** multiplier!\n\n\`\`\`\n${renderMinesGrid(game, false)}\n\`\`\``,
              )
              .addFields(
                { name: "Payout", value: `+${payout.toLocaleString()} BCoins`, inline: true },
                { name: "Balance", value: `${finalBalance.toLocaleString()} BCoins`, inline: true },
              )
              .setFooter({ text: "BCoins Casino • Mines" })
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

    if (btn.customId.startsWith("mine_")) {
      const cellIndex = parseInt(btn.customId.replace("mine_", ""));
      try {
        const { hit, game: updatedGame } = revealCell(userId, cellIndex);

        if (hit) {
          const finalBalance = getUser(userId).balance;
          await btn.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle("💥 Boom! You Hit a Mine!")
                .setDescription(
                  `You lost **${bet.toLocaleString()} BCoins**.\n\n\`\`\`\n${renderMinesGrid(updatedGame, true)}\n\`\`\``,
                )
                .addFields(
                  { name: "Lost", value: `-${bet.toLocaleString()} BCoins`, inline: true },
                  { name: "Balance", value: `${finalBalance.toLocaleString()} BCoins`, inline: true },
                )
                .setFooter({ text: "BCoins Casino • Mines" })
                .setTimestamp(),
            ],
            components: [],
          });
          collector.stop("lost");
        } else {
          const mult = getMinesMultiplier(updatedGame.safeRevealed, mineCount);
          const potentialPayout = Math.round(bet * mult);

          await btn.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0xf5c518)
                .setTitle("💣 Mines")
                .setDescription(`**${mineCount} mines** hidden. Keep going or cash out!\n\nBet: **${bet.toLocaleString()} BCoins**`)
                .addFields(
                  { name: "Safe Revealed", value: `${updatedGame.safeRevealed}`, inline: true },
                  { name: "Multiplier", value: `×${mult.toFixed(2)}`, inline: true },
                  { name: "Current Payout", value: `${potentialPayout.toLocaleString()} BCoins`, inline: true },
                )
                .setFooter({ text: "BCoins Casino • Mines" }),
            ],
            components: [...buildGridButtons(userId), buildCashoutRow(userId)],
          });
        }
      } catch {
        await btn.reply({ content: "Something went wrong.", ephemeral: true });
      }
    }
  });

  collector.on("end", async (_, reason) => {
    if (reason !== "cashout" && reason !== "lost") {
      const currentGame = activeMinesGames.get(userId);
      if (currentGame?.alive) {
        const { payout, multiplier } = cashoutMines(userId);
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
      }
    }
  });
}
