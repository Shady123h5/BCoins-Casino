import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getUser, setBalance } from "../data/db.js";

export const data = new SlashCommandBuilder()
  .setName("give")
  .setDescription("Admin only: Give or remove BCoins from any user")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addIntegerOption((opt) =>
    opt.setName("amount").setDescription("Amount to give (negative to remove)").setRequired(true),
  )
  .addUserOption((opt) =>
    opt.setName("user").setDescription("Target user (leave blank to give to yourself)").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("🔒 Access Denied")
          .setDescription("You must be a server **Administrator** to use this command."),
      ],
      ephemeral: true,
    });
  }

  const target = interaction.options.getUser("user") ?? interaction.user;
  const amount = interaction.options.getInteger("amount", true);

  const before = getUser(target.id).balance;
  const newBalance = Math.max(0, before + amount);
  setBalance(target.id, newBalance);
  const after = getUser(target.id).balance;

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(amount >= 0 ? 0x2ecc71 : 0xe74c3c)
        .setTitle(amount >= 0 ? "💰 BCoins Granted" : "💸 BCoins Removed")
        .addFields(
          { name: "User", value: `<@${target.id}>`, inline: true },
          {
            name: "Change",
            value: `${amount >= 0 ? "+" : ""}${amount.toLocaleString()} BCoins`,
            inline: true,
          },
          {
            name: "New Balance",
            value: `${after.toLocaleString()} BCoins`,
            inline: true,
          },
        )
        .setFooter({ text: `Action by ${interaction.user.tag} • BCoins Casino` })
        .setTimestamp(),
    ],
    ephemeral: true,
  });
}
