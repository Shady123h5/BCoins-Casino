import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getUser } from "../data/db.js";

export const data = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("Check your BCoins balance or another user's balance")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("User to check").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const userData = getUser(target.id);

  const embed = new EmbedBuilder()
    .setColor(0xf5c518)
    .setTitle("💰 BCoins Balance")
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "Player", value: `<@${target.id}>`, inline: true },
      {
        name: "Balance",
        value: `**${userData.balance.toLocaleString()} BCoins**`,
        inline: true,
      },
      { name: "\u200b", value: "\u200b", inline: true },
      {
        name: "Total Won",
        value: `${userData.totalWon.toLocaleString()} BCoins`,
        inline: true,
      },
      {
        name: "Total Lost",
        value: `${userData.totalLost.toLocaleString()} BCoins`,
        inline: true,
      },
      {
        name: "Games Played",
        value: `${userData.gamesPlayed}`,
        inline: true,
      },
    )
    .setFooter({ text: "BCoins Casino" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
