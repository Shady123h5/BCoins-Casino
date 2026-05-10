import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getWinProbability } from "../data/db.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("View all BCoins Casino commands");

export async function execute(interaction: ChatInputCommandInteraction) {
  const prob = getWinProbability();
  const embed = new EmbedBuilder()
    .setColor(0xf5c518)
    .setTitle("🎰 BCoins Casino — Help")
    .setDescription("Welcome to BCoins Casino! Here are all available commands:")
    .addFields(
      {
        name: "💰 Economy",
        value: [
          "`/balance` — Check your or someone else's balance",
          "`/leaderboard` — Top BCoins holders",
        ].join("\n"),
      },
      {
        name: "🎮 Games",
        value: [
          "`/cf bot <amount> <side>` — Coinflip vs bot",
          "`/cf player <user> <amount>` — PvP Coinflip",
          "`/rps bot <choice> <amount>` — Rock Paper Scissors vs bot",
          "`/rps player <user> <amount>` — PvP RPS",
          "`/mines <bet> <mines>` — Mines on a 5×5 grid",
          "`/towers <bet>` — Tower climbing game",
        ].join("\n"),
      },
      {
        name: "🔒 Admin Only",
        value: [
          "`/give <amount> [user]` — Give or remove BCoins",
          "`/owner` — View/change casino win rate",
          "`/turnoff` — Force shut down the bot",
        ].join("\n"),
      },
      {
        name: "📊 Current Odds",
        value: `House win probability: **${((1 - prob) * 100).toFixed(1)}%**`,
      },
    )
    .setFooter({ text: "BCoins Casino • Good luck!" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
