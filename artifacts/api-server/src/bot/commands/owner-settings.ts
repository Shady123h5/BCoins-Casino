import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getWinProbability, setWinProbability } from "../data/db.js";

export const data = new SlashCommandBuilder()
  .setName("owner-settings")
  .setDescription("Owner-only settings panel")
  .addStringOption((opt) =>
    opt
      .setName("secret_key")
      .setDescription("Your owner secret key")
      .setRequired(true),
  )
  .addNumberOption((opt) =>
    opt
      .setName("win_probability")
      .setDescription("Set the house win probability (0.0 to 1.0). 0.5 = fair, 0.1 = house wins 90%")
      .setRequired(false)
      .setMinValue(0)
      .setMaxValue(1),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const key = interaction.options.getString("secret_key", true);
  const expectedKey = process.env["OWNER_SECRET_KEY"];

  if (!expectedKey || key !== expectedKey) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("🔒 Access Denied")
          .setDescription("Invalid secret key."),
      ],
      ephemeral: true,
    });
  }

  const newProb = interaction.options.getNumber("win_probability");

  if (newProb === null) {
    const current = getWinProbability();
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle("⚙️ Owner Settings")
          .addFields(
            {
              name: "Current Win Probability",
              value: `**${(current * 100).toFixed(1)}%**`,
              inline: true,
            },
            {
              name: "House Edge",
              value: `**${((1 - current) * 100).toFixed(1)}%**`,
              inline: true,
            },
            {
              name: "Status",
              value: current === 0.5 ? "🟢 Fair" : current < 0.5 ? "🔴 House Favored" : "🔵 Player Favored",
              inline: true,
            },
          )
          .setDescription(
            "Use `/owner-settings secret_key:<key> win_probability:<0.0-1.0>` to update.\n\n" +
            "• `0.5` = 50/50 fair odds\n• `0.3` = players win 30% of the time\n• `0.7` = players win 70% of the time",
          )
          .setFooter({ text: "BCoins Casino • Owner Panel" })
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  setWinProbability(newProb);
  const pct = (newProb * 100).toFixed(1);
  const housePct = ((1 - newProb) * 100).toFixed(1);

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("✅ Settings Updated")
        .addFields(
          { name: "New Win Probability", value: `**${pct}%**`, inline: true },
          { name: "House Edge", value: `**${housePct}%**`, inline: true },
          {
            name: "Status",
            value:
              newProb === 0.5
                ? "🟢 Fair"
                : newProb < 0.5
                ? "🔴 House Favored"
                : "🔵 Player Favored",
            inline: true,
          },
        )
        .setDescription(`Win probability updated to **${pct}%**. This affects all Player vs Bot games.`)
        .setFooter({ text: "BCoins Casino • Owner Panel" })
        .setTimestamp(),
    ],
    ephemeral: true,
  });
}
