import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getUser, setBalance } from "../data/db.js";

export const data = new SlashCommandBuilder()
  .setName("removebal")
  .setDescription("Admin only: Remove BCoins from a user")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((opt) =>
    opt.setName("user").setDescription("Target user").setRequired(true),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("amount")
      .setDescription("Amount to remove (positive number)")
      .setRequired(true)
      .setMinValue(1),
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

  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  const before = getUser(target.id).balance;
  const newBalance = Math.max(0, before - amount);
  setBalance(target.id, newBalance);
  const removed = before - newBalance;

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("💸 BCoins Removed")
        .addFields(
          { name: "User",        value: `<@${target.id}>`,                    inline: true },
          { name: "Removed",     value: `-${removed.toLocaleString()} BCoins`, inline: true },
          { name: "New Balance", value: `${newBalance.toLocaleString()} BCoins`, inline: true },
        )
        .setFooter({ text: `Action by ${interaction.user.tag} • BCoins Casino` })
        .setTimestamp(),
    ],
    ephemeral: true,
  });
}
