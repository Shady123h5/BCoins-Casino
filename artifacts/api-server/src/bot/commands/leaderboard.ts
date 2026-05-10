import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getLeaderboard } from "../data/db.js";

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("View the top BCoins holders");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const top = getLeaderboard(10);

  const medals = ["🥇", "🥈", "🥉"];
  const lines = top.map((entry, i) => {
    const medal = medals[i] ?? `**${i + 1}.**`;
    return `${medal} <@${entry.userId}> — **${entry.balance.toLocaleString()} BCoins**`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xf5c518)
    .setTitle("🏆 BCoins Leaderboard")
    .setDescription(
      lines.length > 0 ? lines.join("\n") : "No players yet. Start gambling!",
    )
    .setFooter({ text: "BCoins Casino" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
