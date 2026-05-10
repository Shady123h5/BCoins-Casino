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
import { playCoinflipVsBot, playCoinflipPvP, type CoinSide } from "../games/coinflip.js";

export const data = new SlashCommandBuilder()
  .setName("cf")
  .setDescription("Coinflip game")
  .addSubcommand((sub) =>
    sub
      .setName("bot")
      .setDescription("Flip a coin against the bot")
      .addIntegerOption((opt) =>
        opt
          .setName("amount")
          .setDescription("Amount to bet")
          .setRequired(true)
          .setMinValue(1),
      )
      .addStringOption((opt) =>
        opt
          .setName("side")
          .setDescription("Heads or Tails")
          .setRequired(true)
          .addChoices(
            { name: "Heads", value: "heads" },
            { name: "Tails", value: "tails" },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("player")
      .setDescription("Challenge another player to coinflip")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("User to challenge").setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt
          .setName("amount")
          .setDescription("Amount to bet")
          .setRequired(true)
          .setMinValue(1),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "bot") {
    const amount = interaction.options.getInteger("amount", true);
    const side = interaction.options.getString("side", true) as CoinSide;
    const user = getUser(interaction.user.id);

    if (user.balance < amount) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Insufficient Funds")
            .setDescription(
              `You only have **${user.balance.toLocaleString()} BCoins**.`,
            ),
        ],
        ephemeral: true,
      });
    }

    const { result, won } = playCoinflipVsBot(side);
    const resultEmoji = result === "heads" ? "🪙 Heads" : "🌑 Tails";
    const choiceEmoji = side === "heads" ? "🪙 Heads" : "🌑 Tails";

    let newBalance: number;
    if (won) {
      newBalance = addBalance(interaction.user.id, amount);
    } else {
      newBalance = addBalance(interaction.user.id, -amount);
    }

    const embed = new EmbedBuilder()
      .setColor(won ? 0x2ecc71 : 0xe74c3c)
      .setTitle(won ? "🎉 You Won!" : "💸 You Lost!")
      .addFields(
        { name: "Your Pick", value: choiceEmoji, inline: true },
        { name: "Result", value: resultEmoji, inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        {
          name: won ? "Winnings" : "Lost",
          value: `${won ? "+" : "-"}${amount.toLocaleString()} BCoins`,
          inline: true,
        },
        {
          name: "New Balance",
          value: `${newBalance.toLocaleString()} BCoins`,
          inline: true,
        },
      )
      .setFooter({ text: "BCoins Casino • /cf" })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  if (sub === "player") {
    const target = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);

    if (target.id === interaction.user.id) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Invalid Challenge")
            .setDescription("You cannot challenge yourself."),
        ],
        ephemeral: true,
      });
    }
    if (target.bot) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Invalid Challenge")
            .setDescription("You cannot challenge a bot."),
        ],
        ephemeral: true,
      });
    }

    const challenger = getUser(interaction.user.id);
    if (challenger.balance < amount) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Insufficient Funds")
            .setDescription(
              `You only have **${challenger.balance.toLocaleString()} BCoins**.`,
            ),
        ],
        ephemeral: true,
      });
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("cf_accept")
        .setLabel("Accept")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId("cf_decline")
        .setLabel("Decline")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("❌"),
    );

    const challengeEmbed = new EmbedBuilder()
      .setColor(0xf5c518)
      .setTitle("🪙 Coinflip Challenge!")
      .setDescription(
        `<@${interaction.user.id}> challenges <@${target.id}> to a coinflip!\n\nBet: **${amount.toLocaleString()} BCoins**`,
      )
      .setFooter({ text: "You have 60 seconds to accept or decline." });

    const msg = await interaction.reply({
      content: `<@${target.id}>`,
      embeds: [challengeEmbed],
      components: [row],
      fetchReply: true,
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
      filter: (i) => i.user.id === target.id,
    });

    collector.on("collect", async (btnInteraction) => {
      if (btnInteraction.customId === "cf_decline") {
        await btnInteraction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle("❌ Challenge Declined")
              .setDescription(`<@${target.id}> declined the coinflip.`),
          ],
          components: [],
        });
        return;
      }

      const targetUser = getUser(target.id);
      if (targetUser.balance < amount) {
        await btnInteraction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle("❌ Insufficient Funds")
              .setDescription(
                `<@${target.id}> doesn't have enough BCoins.`,
              ),
          ],
          components: [],
        });
        return;
      }

      const result = playCoinflipPvP();
      const winner = result === "heads" ? interaction.user.id : target.id;
      const loser = result === "heads" ? target.id : interaction.user.id;

      addBalance(winner, amount);
      addBalance(loser, -amount);

      const winnerBalance = getUser(winner).balance;

      await btnInteraction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle(`${result === "heads" ? "🪙 Heads" : "🌑 Tails"}!`)
            .setDescription(
              `<@${winner}> wins **${amount.toLocaleString()} BCoins**!\n\nNew balance: **${winnerBalance.toLocaleString()} BCoins**`,
            )
            .setFooter({ text: "BCoins Casino • PvP Coinflip" })
            .setTimestamp(),
        ],
        components: [],
      });
    });

    collector.on("end", async (_, reason) => {
      if (reason === "time") {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x95a5a6)
              .setTitle("⌛ Challenge Expired")
              .setDescription("The coinflip challenge was not accepted in time."),
          ],
          components: [],
        });
      }
    });
  }
}
