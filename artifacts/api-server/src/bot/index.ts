import {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
  type ChatInputCommandInteraction,
  type SlashCommandBuilder,
} from "discord.js";
import { logger } from "../lib/logger.js";

import * as balance from "./commands/balance.js";
import * as daily from "./commands/daily.js";
import * as leaderboard from "./commands/leaderboard.js";
import * as coinflip from "./commands/coinflip.js";
import * as rps from "./commands/rps.js";
import * as mines from "./commands/mines.js";
import * as towers from "./commands/towers.js";
import * as ownerSettings from "./commands/owner-settings.js";
import * as give from "./commands/give.js";
import * as help from "./commands/help.js";

interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
}

const commands: Command[] = [
  balance,
  daily,
  leaderboard,
  coinflip,
  rps,
  mines,
  towers,
  ownerSettings,
  give,
  help,
];

const commandCollection = new Collection<string, Command>();
for (const cmd of commands) {
  commandCollection.set(cmd.data.name, cmd);
}

export async function startBot(): Promise<void> {
  const token = process.env["BOT_TOKEN"];
  if (!token) {
    logger.warn("BOT_TOKEN not set — Discord bot will not start.");
    return;
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once("ready", async (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot logged in");

    const rest = new REST({ version: "10" }).setToken(token);
    const commandData = commands.map((cmd) => cmd.data.toJSON());

    try {
      logger.info("Registering slash commands globally...");
      await rest.put(Routes.applicationCommands(c.user.id), {
        body: commandData,
      });
      logger.info({ count: commandData.length }, "Slash commands registered");
    } catch (err) {
      logger.error({ err }, "Failed to register slash commands");
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const cmd = commandCollection.get(interaction.commandName);
    if (!cmd) return;

    try {
      await cmd.execute(interaction);
    } catch (err) {
      logger.error({ err, command: interaction.commandName }, "Command error");
      const errorEmbed = {
        color: 0xe74c3c,
        title: "❌ Something went wrong",
        description: "An unexpected error occurred. Please try again.",
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(() => null);
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(() => null);
      }
    }
  });

  await client.login(token);
}
