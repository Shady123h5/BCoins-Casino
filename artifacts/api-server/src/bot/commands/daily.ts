import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getUser, addBalance, setBalance } from "../data/db.js";

const cooldowns = new Map<string, number>();
const DAILY_AMOUNT = 500;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const data = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Claim your daily 500 BCoins reward");

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const now = Date.now();
  const lastClaim = cooldowns.get(userId) ?? 0;
  const remaining = COOLDOWN_MS - (now - lastClaim);

  if (remaining > 0) {
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("⏳ Daily Already Claimed")
      .setDescription(
        `You already claimed your daily reward. Come back in **${hours}h ${minutes}m**.`,
      )
      .setFooter({ text: "BCoins Casino" })
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  cooldowns.set(userId, now);
  const user = getUser(userId);
  if (user.balance === 0) {
    setBalance(userId, 0);
  }
  const newBalance = addBalance(userId, DAILY_AMOUNT);

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("🎁 Daily Reward Claimed!")
    .setDescription(`You received **${DAILY_AMOUNT} BCoins**!`)
    .addFields(
      { name: "Reward", value: `+${DAILY_AMOUNT} BCoins`, inline: true },
      {
        name: "New Balance",
        value: `${newBalance.toLocaleString()} BCoins`,
        inline: true,
      },
    )
    .setFooter({ text: "Come back in 24 hours for more • BCoins Casino" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
