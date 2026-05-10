import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("turnoff")
  .setDescription("Admin only: Force shut down the casino bot")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

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

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("🔴 Bot Shutting Down")
        .setDescription(
          `Shutdown initiated by **${interaction.user.tag}**.\n\nThe bot will go offline now.`,
        )
        .setFooter({ text: "BCoins Casino" })
        .setTimestamp(),
    ],
  });

  setTimeout(() => process.exit(0), 1500);
}
