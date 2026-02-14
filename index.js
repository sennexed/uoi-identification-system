import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  AttachmentBuilder
} from "discord.js";

import { createCanvas, loadImage } from "@napi-rs/canvas";
import dotenv from "dotenv";
import pkg from "pg";

dotenv.config();

const { Pool } = pkg;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await pool.query(`
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  issuedOn TEXT NOT NULL,
  internalId TEXT NOT NULL
);
`);

function generateID() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function isAdmin(interaction) {
  return interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID);
}

function logAction(message) {
  const channel = client.channels.cache.get(process.env.LOG_CHANNEL_ID);
  if (channel) channel.send(message).catch(() => {});
}

async function createCard(member, avatarURL) {
  const canvas = createCanvas(800, 500);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, 800, 500);

  const gradient = ctx.createLinearGradient(0, 0, 800, 0);
  gradient.addColorStop(0, "#ff9933");
  gradient.addColorStop(0.5, "#ffffff");
  gradient.addColorStop(1, "#138808");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 800, 8);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px Arial";
  ctx.fillText("UNION OF INDIANS", 30, 45);
  ctx.font = "18px Arial";
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("IDENTIFICATION CARD", 30, 70);

  const avatar = await loadImage(avatarURL);

  const size = 140;
  const x = 60;
  const y = 130;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatar, x, y, size, size);
  ctx.restore();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px Arial";
  ctx.fillText(member.name, 260, 170);

  ctx.font = "22px monospace";
  ctx.fillStyle = "#fbbf24";
  ctx.fillText("ID: " + member.id, 260, 210);

  ctx.font = "20px Arial";
  ctx.fillStyle = "#e2e8f0";
  ctx.fillText("Role: " + member.role, 260, 250);

  const statusColor =
    member.status === "ACTIVE"
      ? "#22c55e"
      : member.status === "SUSPENDED"
      ? "#f59e0b"
      : "#ef4444";

  ctx.fillStyle = statusColor;
  ctx.fillText("Status: " + member.status, 260, 285);

  ctx.font = "16px Arial";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Issued: " + member.issuedOn, 260, 320);
  ctx.fillText("Internal Ref: " + member.internalId, 260, 345);

  return canvas.toBuffer("image/png");
}

const commands = [
  new SlashCommandBuilder()
    .setName("register")
    .setDescription("Register new UOI member")
    .addStringOption(o =>
      o.setName("name").setDescription("Member name").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("role").setDescription("Member role").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verify member ID")
    .addStringOption(o =>
      o.setName("id").setDescription("UOI ID").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("card")
    .setDescription("Generate ID card")
    .addStringOption(o =>
      o.setName("id").setDescription("UOI ID").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("list")
    .setDescription("List all members")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
}

client.once("clientReady", async () => {
  console.log("UOI SYSTEM ONLINE:", client.user.tag);
  await registerCommands();
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply();

  const cmd = interaction.commandName;

  if (cmd === "register") {
    if (!isAdmin(interaction))
      return interaction.editReply("Admin only.");

    const id = generateID();
    const name = interaction.options.getString("name");
    const role = interaction.options.getString("role");

    await pool.query(
      `INSERT INTO members (id, name, role, status, issuedOn, internalId)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, name, role, "ACTIVE",
       new Date().toLocaleDateString(),
       "UOI-" + Date.now()]
    );

    logAction(`Registered: ${name} (${id})`);
    return interaction.editReply(`Registered.\nID: ${id}`);
  }

  if (cmd === "verify") {
    const id = interaction.options.getString("id");
    const result = await pool.query(
      `SELECT * FROM members WHERE id = $1`,
      [id]
    );

    const m = result.rows[0];
    if (!m) return interaction.editReply("Not found.");

    return interaction.editReply(
      `Name: ${m.name}\nRole: ${m.role}\nStatus: ${m.status}`
    );
  }

  if (cmd === "card") {
    const id = interaction.options.getString("id");
    const result = await pool.query(
      `SELECT * FROM members WHERE id = $1`,
      [id]
    );

    const m = result.rows[0];
    if (!m) return interaction.editReply("Not found.");

    const user = await interaction.client.users.fetch(interaction.user.id);
    const avatarURL = user.displayAvatarURL({ extension: "png", size: 512 });

    const buffer = await createCard(m, avatarURL);

    return interaction.editReply({
      files: [new AttachmentBuilder(buffer, { name: "uoi-card.png" })]
    });
  }

  if (cmd === "list") {
    if (!isAdmin(interaction))
      return interaction.editReply("Admin only.");

    const result = await pool.query(`SELECT * FROM members`);
    if (!result.rows.length)
      return interaction.editReply("No members.");

    const text = result.rows
      .map(r => `${r.id} | ${r.name} | ${r.status}`)
      .join("\n");

    return interaction.editReply("```\n" + text + "\n```");
  }
});

client.login(process.env.DISCORD_TOKEN);
