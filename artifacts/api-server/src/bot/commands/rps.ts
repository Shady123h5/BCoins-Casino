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
import { playRPSVsBot, playRPSPvP, rpsEmoji, type RPSChoice } from "../games/rps.js";

const pendingRPS = new Map<string, { choice: RPSChoice; amount: number; challengerId: string }>();

export const data = new SlashCommandBuilder()
  .setName("rps")
  .setDescription("Rock Paper Scissors")
  .addSubcommand((sub) =>
    sub
      .setName("bot")
      .setDescription("Play Rock Paper Scissors against the bot")
      .addStringOption((opt) =>
        opt
          .setName("choice")
          .setDescription("Your choice")
          .setRequired(true)
          .addChoices(
            { name: "🪨 Rock", value: "rock" },
            { name: "📄 Paper", value: "paper" },
            { name: "✂️ Scissors", value: "scissors" },
          ),
      )
      .addIntegerOption((opt) =>
        opt.setName("amount").setDescription("Amount to bet").setRequired(true).setMinValue(1),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("player")
      .setDescription("Challenge another player to Rock Paper Scissors")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("User to challenge").setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt.setName("amount").setDescription("Amount to bet").setRequired(true).setMinValue(1),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "bot") {
    const choice = interaction.options.getString("choice", true) as RPSChoice;
    const amount = interaction.options.getInteger("amount", true);
    const user = getUser(interaction.user.id);

    if (user.balance < amount) {
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

    const { botChoice, result } = playRPSVsBot(choice);

    let newBalance: number;
    let resultTitle: string;
    let color: number;

    if (result === "win") {
      newBalance = addBalance(interaction.user.id, amount);
      resultTitle = "🎉 You Won!";
      color = 0x2ecc71;
    } else if (result === "loss") {
      newBalance = addBalance(interaction.user.id, -amount);
      resultTitle = "💸 You Lost!";
      color = 0xe74c3c;
    } else {
      newBalance = user.balance;
      resultTitle = "🤝 It's a Tie!";
      color = 0xf5c518;
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(resultTitle)
      .addFields(
        { name: "Your Choice", value: `${rpsEmoji[choice]} ${choice}`, inline: true },
        { name: "Bot's Choice", value: `${rpsEmoji[botChoice]} ${botChoice}`, inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        {
          name: result === "tie" ? "Bet Returned" : result === "win" ? "Winnings" : "Lost",
          value: `${result === "loss" ? "-" : "+"}${amount.toLocaleString()} BCoins`,
          inline: true,
        },
        { name: "New Balance", value: `${newBalance.toLocaleString()} BCoins`, inline: true },
      )
      .setFooter({ text: "BCoins Casino • /rps" })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  if (sub === "player") {
    const target = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);

    if (target.id === interaction.user.id || target.bot) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Invalid Challenge")
            .setDescription("You cannot challenge yourself or a bot."),
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
            .setDescription(`You only have **${challenger.balance.toLocaleString()} BCoins**.`),
        ],
        ephemeral: true,
      });
    }

    const rpsRow = (label: string) =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("rps_rock").setLabel("🪨 Rock").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("rps_paper").setLabel("📄 Paper").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("rps_scissors").setLabel("✂️ Scissors").setStyle(ButtonStyle.Secondary),
      );

    const challengeEmbed = new EmbedBuilder()
      .setColor(0xf5c518)
      .setTitle("✊ Rock Paper Scissors Challenge!")
      .setDescription(
        `<@${interaction.user.id}> challenges <@${target.id}>!\n\nBet: **${amount.toLocaleString()} BCoins**\n\nFirst, <@${interaction.user.id}> pick your move (secretly):`,
      )
      .setFooter({ text: "Both players choose in secret • BCoins Casino" });

    const msg = await interaction.reply({
      content: `<@${interaction.user.id}>`,
      embeds: [challengeEmbed],
      components: [rpsRow("challenger")],
      fetchReply: true,
    });

    const challengerCollector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id,
      max: 1,
      time: 30000,
    });

    challengerCollector.on("collect", async (btn) => {
      const challChoice = btn.customId.replace("rps_", "") as RPSChoice;
      pendingRPS.set(interaction.id, {
        choice: challChoice,
        amount,
        challengerId: interaction.user.id,
      });

      await btn.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf5c518)
            .setTitle("✊ RPS Challenge")
            .setDescription(
              `<@${interaction.user.id}> has made their choice!\n\nNow <@${target.id}>, pick your move:`,
            ),
        ],
        components: [rpsRow("target")],
      });

      const targetCollector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === target.id,
        max: 1,
        time: 30000,
      });

      targetCollector.on("collect", async (tbtn) => {
        const targetChoice = tbtn.customId.replace("rps_", "") as RPSChoice;
        const pending = pendingRPS.get(interaction.id);
        if (!pending) return;
        pendingRPS.delete(interaction.id);

        const targetUser = getUser(target.id);
        if (targetUser.balance < amount) {
          await tbtn.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle("❌ Insufficient Funds")
                .setDescription(`<@${target.id}> doesn't have enough BCoins.`),
            ],
            components: [],
          });
          return;
        }

        const result = playRPSPvP(pending.choice, targetChoice);
        let description: string;
        let color: number;

        if (result === "tie") {
          description = `It's a tie! No BCoins transferred.`;
          color = 0xf5c518;
        } else if (result === "win") {
          addBalance(interaction.user.id, amount);
          addBalance(target.id, -amount);
          description = `<@${interaction.user.id}> wins **${amount.toLocaleString()} BCoins**!`;
          color = 0x2ecc71;
        } else {
          addBalance(target.id, amount);
          addBalance(interaction.user.id, -amount);
          description = `<@${target.id}> wins **${amount.toLocaleString()} BCoins**!`;
          color = 0x2ecc71;
        }

        await tbtn.update({
          embeds: [
            new EmbedBuilder()
              .setColor(color)
              .setTitle("✊ RPS Result")
              .setDescription(description)
              .addFields(
                {
                  name: `<@${interaction.user.id}>`,
                  value: `${rpsEmoji[pending.choice]} ${pending.choice}`,
                  inline: true,
                },
                {
                  name: `<@${target.id}>`,
                  value: `${rpsEmoji[targetChoice]} ${targetChoice}`,
                  inline: true,
                },
              )
              .setFooter({ text: "BCoins Casino • PvP RPS" })
              .setTimestamp(),
          ],
          components: [],
        });
      });

      targetCollector.on("end", async (_, reason) => {
        if (reason === "time") {
          pendingRPS.delete(interaction.id);
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x95a5a6)
                .setTitle("⌛ Challenge Expired")
                .setDescription("The RPS challenge timed out."),
            ],
            components: [],
          });
        }
      });
    });

    challengerCollector.on("end", async (_, reason) => {
      if (reason === "time") {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x95a5a6)
              .setTitle("⌛ Challenge Expired")
              .setDescription("The challenger did not pick in time."),
          ],
          components: [],
        });
      }
    });
  }
}
