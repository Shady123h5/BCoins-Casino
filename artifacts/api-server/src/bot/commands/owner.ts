import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getWinProbability, setWinProbability } from "../data/db.js";

export const data = new SlashCommandBuilder()
  .setName("owner")
  .setDescription(".")
  .addStringOption((opt) =>
    opt.setName("ownerkey").setDescription(".").setRequired(true),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("per")
      .setDescription(".")
      .setRequired(false)
      .setMinValue(0)
      .setMaxValue(100),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const key = interaction.options.getString("ownerkey", true);
  const expectedKey = process.env["OWNER_SECRET_KEY"];

  if (!expectedKey || key !== expectedKey) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("🔒 Access Denied")
          .setDescription("Invalid key."),
      ],
      ephemeral: true,
    });
  }

  const per = interaction.options.getInteger("per");

  if (per === null) {
    const current = getWinProbability();
    const casinoWinRate = ((1 - current) * 100).toFixed(1);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle("⚙️ Owner Panel")
          .addFields(
            {
              name: "Casino Win Rate",
              value: `**${casinoWinRate}%**`,
              inline: true,
            },
            {
              name: "Player Win Rate",
              value: `**${(current * 100).toFixed(1)}%**`,
              inline: true,
            },
            {
              name: "Status",
              value:
                current === 0.5
                  ? "🟢 Fair"
                  : current < 0.5
                  ? "🔴 House Favored"
                  : "🔵 Player Favored",
              inline: true,
            },
          )
          .setFooter({ text: "BCoins Casino" })
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  const playerWinProb = (100 - per) / 100;
  setWinProbability(playerWinProb);

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("✅ Updated")
        .addFields(
          {
            name: "Casino Win Rate",
            value: `**${per}%**`,
            inline: true,
          },
          {
            name: "Player Win Rate",
            value: `**${(100 - per)}%**`,
            inline: true,
          },
          {
            name: "Status",
            value:
              per === 50
                ? "🟢 Fair"
                : per > 50
                ? "🔴 House Favored"
                : "🔵 Player Favored",
            inline: true,
          },
        )
        .setFooter({ text: "BCoins Casino" })
        .setTimestamp(),
    ],
    ephemeral: true,
  });
}
