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
import Database from "better-sqlite3";

dotenv.config();

// ======================
// BASIC SAFETY CHECKS
// ======================

if (!process.env.DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN in environment variables.");
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  console.error("Missing CLIENT_ID in environment variables.");
  process.exit(1);
}

// ======================
// CLIENT
// ======================

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ======================
// DATABASE
// ======================

const db = new Database("uoi.db");

db.prepare(`
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  issuedOn TEXT NOT NULL,
  internalId TEXT NOT NULL
)
`).run();

// ======================
// HELPERS
// ======================

function generateID() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function isAdmin(interaction) {
  if (!process.env.ADMIN_ROLE_ID) return false;
  return interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID);
}

function logAction(message) {
  if (!process.env.LOG_CHANNEL_ID) return;
  const channel = client.channels.cache.get(process.env.LOG_CHANNEL_ID);
  if (channel) channel.send(`📘 ${message}`);
}

// ======================
// CARD GENERATOR
// ======================

async function createCard(member, interaction) {
  const canvas = createCanvas(800, 500);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, 800, 500);

  // Tricolor strip
  const gradient = ctx.createLinearGradient(0, 0, 800, 0);
  gradient.addColorStop(0, "#ff9933");
  gradient.addColorStop(0.5, "#ffffff");
  gradient.addColorStop(1, "#138808");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 800, 12);

  // Header
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px Sans";
  ctx.fillText("UNION OF INDIANS", 40, 70);

  ctx.font = "24px Sans";
  ctx.fillText("IDENTIFICATION CARD", 40, 110);

  // Avatar
  try {
    const avatarURL = interaction.user.displayAvatarURL({
      extension: "png",
      size: 256
    });

    const res = await fetch(avatarURL);
    const buffer = Buffer.from(await res.arrayBuffer());
    const avatar = await loadImage(buffer);

    const size = 180;
    const x = 580;
    const y = 150;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(avatar, x, y, size, size);
    ctx.restore();

    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.stroke();
  } catch (err) {
    console.log("Avatar failed:", err);
  }

  // Member Info
  ctx.font = "bold 48px Sans";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(member.name, 40, 200);

  ctx.font = "30px monospace";
  ctx.fillStyle = "#fbbf24";
  ctx.fillText("ID: " + member.id, 40, 250);

  ctx.font = "26px Sans";
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Role: " + member.role, 40, 310);
  ctx.fillText("Status: " + member.status, 40, 350);

  ctx.font = "20px Sans";
  ctx.fillStyle = "#64748b";
  ctx.fillText("Issued: " + member.issuedOn, 40, 400);
  ctx.fillText("Internal Ref: " + member.internalId, 40, 430);

  return canvas.toBuffer("image/png");
}

// ======================
// SLASH COMMANDS
// ======================

const commands = [
  new SlashCommandBuilder()
    .setName("register")
    .setDescription("Register a new UOI member")
    .addStringOption(o =>
      o.setName("name").setDescription("Member name").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("role").setDescription("Member role").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verify a UOI ID")
    .addStringOption(o =>
      o.setName("id").setDescription("Member ID").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("card")
    .setDescription("Generate ID card")
    .addStringOption(o =>
      o.setName("id").setDescription("Member ID").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("lookup")
    .setDescription("Lookup member by ID")
    .addStringOption(o =>
      o.setName("id").setDescription("Member ID").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("list")
    .setDescription("List all registered members")
].map(c => c.toJSON());

// ======================
// REGISTER COMMANDS
// ======================

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
}

// ======================
// READY
// ======================

client.once("clientReady", async () => {
  console.log("UOI SYSTEM ONLINE:", client.user.tag);
  await registerCommands();
});

// ======================
// INTERACTIONS
// ======================

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

    db.prepare(`INSERT INTO members VALUES (?, ?, ?, ?, ?, ?)`)
      .run(
        id,
        name,
        role,
        "ACTIVE",
        new Date().toLocaleDateString(),
        "UOI-" + Date.now()
      );

    logAction(`Registered ${name} (${id})`);
    return interaction.editReply(`Registered.\nID: ${id}`);
  }

  if (cmd === "verify" || cmd === "lookup") {
    const id = interaction.options.getString("id");
    const m = db.prepare("SELECT * FROM members WHERE id = ?").get(id);
    if (!m) return interaction.editReply("Not found.");

    return interaction.editReply(
      `Name: ${m.name}\nRole: ${m.role}\nStatus: ${m.status}`
    );
  }

  if (cmd === "card") {
    const id = interaction.options.getString("id");
    const m = db.prepare("SELECT * FROM members WHERE id = ?").get(id);
    if (!m) return interaction.editReply("Not found.");

    const buffer = await createCard(m, interaction);

    return interaction.editReply({
      files: [new AttachmentBuilder(buffer, { name: "uoi-card.png" })]
    });
  }

  if (cmd === "list") {
    const rows = db.prepare("SELECT * FROM members").all();
    if (!rows.length) return interaction.editReply("No members.");

    const text = rows.map(r => `${r.id} | ${r.name} | ${r.status}`).join("\n");

    return interaction.editReply("```\n" + text + "\n```");
  }
});

// ======================
// LOGIN
// ======================

client.login(process.env.DISCORD_TOKEN);
