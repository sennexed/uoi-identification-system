import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { createCanvas } from "@napi-rs/canvas";
import dotenv from "dotenv";

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const registry = {};

const commands = [
  new SlashCommandBuilder()
    .setName("register")
    .setDescription("Register a UOI member")
    .addStringOption(o => o.setName("name").setDescription("Full Name").setRequired(true))
    .addStringOption(o => o.setName("role").setDescription("Server Role").setRequired(true)),

  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verify UOI ID")
    .addStringOption(o => o.setName("id").setDescription("Member ID").setRequired(true)),

  new SlashCommandBuilder()
    .setName("card")
    .setDescription("Generate UOI ID Card")
    .addStringOption(o => o.setName("id").setDescription("Member ID").setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
}

function generateID() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function createCard(member) {
  const canvas = createCanvas(800, 500);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Accent line (Indian flag gradient style)
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, "#ff9933");
  gradient.addColorStop(0.5, "#ffffff");
  gradient.addColorStop(1, "#138808");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, 10);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Arial";
  ctx.fillText("UNION OF INDIANS", 40, 60);

  ctx.font = "20px Arial";
  ctx.fillText("IDENTIFICATION CARD", 40, 90);

  ctx.font = "bold 40px Arial";
  ctx.fillText(member.name, 40, 170);

  ctx.font = "24px monospace";
  ctx.fillStyle = "#fbbf24";
  ctx.fillText("ID: " + member.id, 40, 220);

  ctx.font = "22px Arial";
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Role: " + member.role, 40, 260);
  ctx.fillText("Status: " + member.status, 40, 300);

  ctx.font = "18px Arial";
  ctx.fillStyle = "#64748b";
  ctx.fillText("Issued: " + member.issuedOn, 40, 350);
  ctx.fillText("Internal Ref: " + member.internalId, 40, 380);

  return canvas.toBuffer("image/png");
}

client.once("clientReady", async () => {
  console.log("UOI BOT ONLINE:", client.user.tag);
  await registerCommands();
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply();

  if (interaction.commandName === "register") {
    const name = interaction.options.getString("name");
    const role = interaction.options.getString("role");

    const id = generateID();

    registry[id] = {
      id,
      name,
      role,
      status: "ACTIVE",
      issuedOn: new Date().toLocaleDateString(),
      internalId: "UOI-" + Date.now()
    };

    return interaction.editReply(`Registered ${name}\nUOI ID: ${id}`);
  }

  if (interaction.commandName === "verify") {
    const id = interaction.options.getString("id");

    if (!registry[id]) {
      return interaction.editReply("ID not found.");
    }

    const m = registry[id];

    return interaction.editReply(
      `Verification Report\nName: ${m.name}\nRole: ${m.role}\nStatus: ${m.status}`
    );
  }

  if (interaction.commandName === "card") {
    const id = interaction.options.getString("id");

    if (!registry[id]) {
      return interaction.editReply("ID not found.");
    }

    const buffer = createCard(registry[id]);
    const attachment = new AttachmentBuilder(buffer, { name: "uoi-card.png" });

    return interaction.editReply({ files: [attachment] });
  }
});

client.login(process.env.DISCORD_TOKEN);
