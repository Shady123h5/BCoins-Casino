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
        opt.setName("amount").setDescription("Amount to bet").setRequired(true).setMinValue(1),
      )
      .addStringOption((opt) =>
        opt
          .setName("side")
          .setDescription("Heads or Tails")
          .setRequired(true)
          .addChoices({ name: "Heads", value: "heads" }, { name: "Tails", value: "tails" }),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("open")
      .setDescription("Post an open coinflip — anyone in the server can join")
      .addIntegerOption((opt) =>
        opt.setName("amount").setDescription("Amount to bet").setRequired(true).setMinValue(1),
      )
      .addStringOption((opt) =>
        opt
          .setName("side")
          .setDescription("Your side (heads or tails)")
          .setRequired(true)
          .addChoices({ name: "🪙 Heads", value: "heads" }, { name: "🌑 Tails", value: "tails" }),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  // ── VS BOT ────────────────────────────────────────────────────────────────
  if (sub === "bot") {
    const amount = interaction.options.getInteger("amount", true);
    const side   = interaction.options.getString("side", true) as CoinSide;
    const user   = getUser(interaction.user.id);

    if (user.balance < amount) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle("❌ Insufficient Funds")
          .setDescription(`You only have **${user.balance.toLocaleString()} BCoins**.`)],
        ephemeral: true,
      });
    }

    const { result, won } = playCoinflipVsBot(side);
    const resultEmoji = result === "heads" ? "🪙 Heads" : "🌑 Tails";
    const choiceEmoji = side   === "heads" ? "🪙 Heads" : "🌑 Tails";
    const newBalance  = addBalance(interaction.user.id, won ? amount : -amount);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(won ? 0x2ecc71 : 0xe74c3c)
          .setTitle(won ? "🎉 You Won!" : "💸 You Lost!")
          .addFields(
            { name: "Your Pick",   value: choiceEmoji,                                           inline: true },
            { name: "Result",      value: resultEmoji,                                           inline: true },
            { name: "\u200b",      value: "\u200b",                                              inline: true },
            { name: won ? "Winnings" : "Lost", value: `${won ? "+" : "-"}${amount.toLocaleString()} BCoins`, inline: true },
            { name: "New Balance", value: `${newBalance.toLocaleString()} BCoins`,               inline: true },
          )
          .setFooter({ text: "BCoins Casino • /cf bot" })
          .setTimestamp(),
      ],
    });
  }

  // ── OPEN (anyone can join) ────────────────────────────────────────────────
  if (sub === "open") {
    const amount      = interaction.options.getInteger("amount", true);
    const side        = interaction.options.getString("side", true) as CoinSide;
    const creatorId   = interaction.user.id;
    const sideEmoji   = side === "heads" ? "🪙 Heads" : "🌑 Tails";
    const oppEmoji    = side === "heads" ? "🌑 Tails" : "🪙 Heads";

    const creator = getUser(creatorId);
    if (creator.balance < amount) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle("❌ Insufficient Funds")
          .setDescription(`You only have **${creator.balance.toLocaleString()} BCoins**.`)],
        ephemeral: true,
      });
    }

    const joinRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("cf_join")
        .setLabel("⚔️  Join Game")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("cf_cancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary),
    );

    const openEmbed = new EmbedBuilder()
      .setColor(0xf5c518)
      .setTitle("🪙 Open Coinflip")
      .setDescription(
        `<@${creatorId}> wants to flip a coin!\n\n` +
        `Bet: **${amount.toLocaleString()} BCoins**\n` +
        `<@${creatorId}> is on **${sideEmoji}** — joiner gets **${oppEmoji}**\n\n` +
        `Click **⚔️ Join Game** to accept!`,
      )
      .setFooter({ text: "Open for 2 minutes • BCoins Casino" });

    const msg = await interaction.reply({
      embeds: [openEmbed],
      components: [joinRow],
      fetchReply: true,
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    let settled = false;

    collector.on("collect", async (btn) => {
      if (settled) return;

      // Creator can cancel
      if (btn.customId === "cf_cancel") {
        if (btn.user.id !== creatorId) {
          await btn.reply({ content: "Only the creator can cancel.", ephemeral: true });
          return;
        }
        settled = true;
        collector.stop("cancel");
        await btn.update({
          embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("🚫 Game Cancelled")
            .setDescription(`<@${creatorId}> cancelled the coinflip.`)],
          components: [],
        });
        return;
      }

      // Join button
      if (btn.customId === "cf_join") {
        if (btn.user.id === creatorId) {
          await btn.reply({ content: "You can't join your own game.", ephemeral: true });
          return;
        }

        const joiner = getUser(btn.user.id);
        if (joiner.balance < amount) {
          await btn.reply({
            embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle("❌ Insufficient Funds")
              .setDescription(`You only have **${joiner.balance.toLocaleString()} BCoins**.`)],
            ephemeral: true,
          });
          return;
        }

        settled = true;
        collector.stop("played");

        // Deduct both, run flip
        const result  = playCoinflipPvP(); // "heads" or "tails"
        const creatorWon = result === side;
        const winnerId   = creatorWon ? creatorId : btn.user.id;
        const loserId    = creatorWon ? btn.user.id : creatorId;
        const resultEmoji = result === "heads" ? "🪙 Heads" : "🌑 Tails";

        addBalance(winnerId, amount);
        addBalance(loserId, -amount);
        const winnerBal = getUser(winnerId).balance;

        await btn.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ecc71)
              .setTitle(`${resultEmoji}!`)
              .setDescription(
                `<@${winnerId}> wins **${amount.toLocaleString()} BCoins**!\n` +
                `New balance: **${winnerBal.toLocaleString()} BCoins**`,
              )
              .addFields(
                { name: `<@${creatorId}>`, value: sideEmoji,  inline: true },
                { name: `<@${btn.user.id}>`, value: oppEmoji, inline: true },
              )
              .setFooter({ text: "BCoins Casino • Open Coinflip" })
              .setTimestamp(),
          ],
          components: [],
        });
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason === "time") {
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("⌛ No One Joined")
            .setDescription("The coinflip expired with no challenger.")],
          components: [],
        });
      }
    });
  }
}
