import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getUser, addBalance, setBalance } from "../data/db.js";

export const data = new SlashCommandBuilder()
  .setName("give")
  .setDescription("Owner command: Give or remove BCoins from a user")
  .addStringOption((opt) =>
    opt.setName("secret_key").setDescription("Owner secret key").setRequired(true),
  )
  .addUserOption((opt) =>
    opt.setName("user").setDescription("Target user").setRequired(true),
  )
  .addIntegerOption((opt) =>
    opt.setName("amount").setDescription("Amount (negative to remove)").setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const key = interaction.options.getString("secret_key", true);
  if (key !== process.env["OWNER_SECRET_KEY"]) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle("🔒 Access Denied").setDescription("Invalid secret key.")],
      ephemeral: true,
    });
  }

  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);
  const before = getUser(target.id).balance;
  const newBalance = before + amount;
  setBalance(target.id, Math.max(0, newBalance));
  const after = getUser(target.id).balance;

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(amount >= 0 ? 0x2ecc71 : 0xe74c3c)
        .setTitle("💼 Balance Updated")
        .addFields(
          { name: "User", value: `<@${target.id}>`, inline: true },
          { name: "Change", value: `${amount >= 0 ? "+" : ""}${amount.toLocaleString()} BCoins`, inline: true },
          { name: "New Balance", value: `${after.toLocaleString()} BCoins`, inline: true },
        )
        .setFooter({ text: "BCoins Casino • Owner Panel" })
        .setTimestamp(),
    ],
    ephemeral: true,
  });
}
