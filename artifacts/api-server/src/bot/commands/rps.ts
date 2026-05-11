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

// Open games waiting for a joiner:  messageId → { creatorId, creatorChoice, amount }
const openGames = new Map<string, { creatorId: string; creatorChoice: RPSChoice; amount: number }>();

function moveRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("rps_rock").setLabel("🪨 Rock").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("rps_paper").setLabel("📄 Paper").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("rps_scissors").setLabel("✂️ Scissors").setStyle(ButtonStyle.Secondary),
  );
}

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
            { name: "🪨 Rock",     value: "rock"     },
            { name: "📄 Paper",    value: "paper"    },
            { name: "✂️ Scissors", value: "scissors" },
          ),
      )
      .addIntegerOption((opt) =>
        opt.setName("amount").setDescription("Amount to bet").setRequired(true).setMinValue(1),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("open")
      .setDescription("Post an open RPS game — anyone in the server can join")
      .addIntegerOption((opt) =>
        opt.setName("amount").setDescription("Amount to bet").setRequired(true).setMinValue(1),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  // ── VS BOT ────────────────────────────────────────────────────────────────
  if (sub === "bot") {
    const choice = interaction.options.getString("choice", true) as RPSChoice;
    const amount = interaction.options.getInteger("amount", true);
    const user   = getUser(interaction.user.id);

    if (user.balance < amount) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle("❌ Insufficient Funds")
          .setDescription(`You only have **${user.balance.toLocaleString()} BCoins**.`)],
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

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setTitle(resultTitle)
          .addFields(
            { name: "Your Choice", value: `${rpsEmoji[choice]} ${choice}`,     inline: true },
            { name: "Bot's Choice", value: `${rpsEmoji[botChoice]} ${botChoice}`, inline: true },
            { name: "\u200b", value: "\u200b", inline: true },
            { name: result === "tie" ? "Bet Returned" : result === "win" ? "Winnings" : "Lost",
              value: `${result === "loss" ? "-" : "+"}${amount.toLocaleString()} BCoins`, inline: true },
            { name: "New Balance", value: `${newBalance.toLocaleString()} BCoins`, inline: true },
          )
          .setFooter({ text: "BCoins Casino • /rps bot" })
          .setTimestamp(),
      ],
    });
  }

  // ── OPEN (anyone can join) ────────────────────────────────────────────────
  if (sub === "open") {
    const amount    = interaction.options.getInteger("amount", true);
    const creatorId = interaction.user.id;

    const creator = getUser(creatorId);
    if (creator.balance < amount) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle("❌ Insufficient Funds")
          .setDescription(`You only have **${creator.balance.toLocaleString()} BCoins**.`)],
        ephemeral: true,
      });
    }

    // Step 1: creator picks their move secretly (ephemeral)
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf5c518)
          .setTitle("✊ Pick Your Move")
          .setDescription("Choose your move — only you can see this:"),
      ],
      components: [moveRow()],
      ephemeral: true,
    });

    let creatorChoice: RPSChoice | null = null;
    let publicMsg: Awaited<ReturnType<typeof interaction.channel.send>> | null = null;

    try {
      const creatorPick = await interaction.channel!.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) =>
          i.user.id === creatorId &&
          ["rps_rock", "rps_paper", "rps_scissors"].includes(i.customId),
        time: 30_000,
      });

      creatorChoice = creatorPick.customId.replace("rps_", "") as RPSChoice;

      // Acknowledge the pick (ephemeral update)
      await creatorPick.reply({
        content: `Got it! You picked **${rpsEmoji[creatorChoice]} ${creatorChoice}**. Waiting for someone to join...`,
        ephemeral: true,
      });
    } catch {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("⌛ Timed Out")
          .setDescription("You didn't pick a move in time.")],
        components: [],
      });
      return;
    }

    // Step 2: post the public open-game card
    const joinRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("rps_join").setLabel("⚔️  Join Game").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("rps_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary),
    );

    publicMsg = await interaction.channel!.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf5c518)
          .setTitle("✊ Open RPS Game")
          .setDescription(
            `<@${creatorId}> is looking for an opponent!\n\n` +
            `Bet: **${amount.toLocaleString()} BCoins**\n\n` +
            `Click **⚔️ Join Game** to challenge them!`,
          )
          .setFooter({ text: "Open for 2 minutes • BCoins Casino" }),
      ],
      components: [joinRow],
    });

    openGames.set(publicMsg.id, { creatorId, creatorChoice, amount });

    const collector = publicMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    let settled = false;

    collector.on("collect", async (btn) => {
      if (settled) return;

      // Cancel
      if (btn.customId === "rps_cancel") {
        if (btn.user.id !== creatorId) {
          await btn.reply({ content: "Only the creator can cancel.", ephemeral: true });
          return;
        }
        settled = true;
        openGames.delete(publicMsg!.id);
        collector.stop("cancel");
        await btn.update({
          embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("🚫 Game Cancelled")
            .setDescription(`<@${creatorId}> cancelled the RPS game.`)],
          components: [],
        });
        return;
      }

      // Someone wants to join
      if (btn.customId === "rps_join") {
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

        // Lock the game so no one else can join
        settled = true;
        openGames.delete(publicMsg!.id);
        collector.stop("played");

        // Disable join button while joiner picks
        await btn.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0xf5c518)
              .setTitle("✊ Open RPS Game")
              .setDescription(`<@${btn.user.id}> joined! Waiting for their move...`),
          ],
          components: [],
        });

        // Ask joiner for their move (ephemeral)
        await btn.followUp({
          embeds: [new EmbedBuilder().setColor(0xf5c518).setTitle("✊ Pick Your Move")
            .setDescription("Choose your move — only you can see this:")],
          components: [moveRow()],
          ephemeral: true,
        });

        // Wait for joiner's pick
        let joinerChoice: RPSChoice;
        try {
          const joinerPick = await interaction.channel!.awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: (i) =>
              i.user.id === btn.user.id &&
              ["rps_rock", "rps_paper", "rps_scissors"].includes(i.customId),
            time: 30_000,
          });

          joinerChoice = joinerPick.customId.replace("rps_", "") as RPSChoice;
          await joinerPick.reply({ content: `Got it! **${rpsEmoji[joinerChoice]} ${joinerChoice}** locked in.`, ephemeral: true });
        } catch {
          // Joiner didn't pick — cancel
          await publicMsg!.edit({
            embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("⌛ Timed Out")
              .setDescription(`<@${btn.user.id}> didn't pick a move in time. Game cancelled.`)],
            components: [],
          });
          return;
        }

        // Resolve
        const result = playRPSPvP(creatorChoice!, joinerChoice);
        let description: string;
        let color: number;

        if (result === "tie") {
          description = "It's a **tie**! No BCoins transferred.";
          color = 0xf5c518;
        } else if (result === "win") {
          addBalance(creatorId, amount);
          addBalance(btn.user.id, -amount);
          const bal = getUser(creatorId).balance;
          description = `<@${creatorId}> wins **${amount.toLocaleString()} BCoins**!\nNew balance: **${bal.toLocaleString()} BCoins**`;
          color = 0x2ecc71;
        } else {
          addBalance(btn.user.id, amount);
          addBalance(creatorId, -amount);
          const bal = getUser(btn.user.id).balance;
          description = `<@${btn.user.id}> wins **${amount.toLocaleString()} BCoins**!\nNew balance: **${bal.toLocaleString()} BCoins**`;
          color = 0x2ecc71;
        }

        await publicMsg!.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(color)
              .setTitle("✊ RPS Result")
              .setDescription(description)
              .addFields(
                { name: `<@${creatorId}>`,    value: `${rpsEmoji[creatorChoice!]} ${creatorChoice}`, inline: true },
                { name: `<@${btn.user.id}>`,  value: `${rpsEmoji[joinerChoice]} ${joinerChoice}`,   inline: true },
              )
              .setFooter({ text: "BCoins Casino • Open RPS" })
              .setTimestamp(),
          ],
          components: [],
        });
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason === "time") {
        openGames.delete(publicMsg!.id);
        await publicMsg!.edit({
          embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("⌛ No One Joined")
            .setDescription("The RPS game expired with no challenger.")],
          components: [],
        });
      }
    });
  }
}
