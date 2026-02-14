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

/* ================= DATABASE SETUP ================= */

await pool.query(`
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  issuedOn TEXT NOT NULL,
  internalId TEXT NOT NULL
);
`);

/* ================= HELPERS ================= */

function generateID() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function isAdmin(interaction) {
  return interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID);
}

async function createCard(member, discordUser) {
  const canvas = createCanvas(1000, 600);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#e0f2fe"; // light blue
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Top bar
  ctx.fillStyle = "#0ea5e9";
  ctx.fillRect(0, 0, canvas.width, 80);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px Arial";
  ctx.fillText("UNION OF INDIANS", 40, 50);

  ctx.font = "22px Arial";
  ctx.fillText("Official Identification Card", 40, 75);

  // Left PFP Circle
  let avatarURL = null;
  if (discordUser) {
    avatarURL = discordUser.displayAvatarURL({
      extension: "png",
      size: 512
    });
  }

  if (avatarURL) {
    const avatar = await loadImage(avatarURL);

    ctx.save();
    ctx.beginPath();
    ctx.arc(200, 300, 150, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 50, 150, 300, 300);
    ctx.restore();
  }

  // Right Text Section
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 48px Arial";
  ctx.fillText(member.name, 450, 220);

  ctx.font = "32px monospace";
  ctx.fillStyle = "#0369a1";
  ctx.fillText("ID: " + member.id, 450, 280);

  ctx.font = "28px Arial";
  ctx.fillStyle = "#1e293b";
  ctx.fillText("Role: " + member.role, 450, 330);
  ctx.fillText("Status: " + member.status, 450, 370);

  ctx.font = "20px Arial";
  ctx.fillStyle = "#475569";
  ctx.fillText("Issued: " + member.issuedon, 450, 430);
  ctx.fillText("Internal Ref: " + member.internalid, 450, 460);

  return canvas.toBuffer("image/png");
}

/* ================= SLASH COMMANDS ================= */

const commands = [
  new SlashCommandBuilder()
    .setName("register")
    .setDescription("Register new UOI member")
    .addStringOption(o =>
      o.setName("name")
        .setDescription("Full Name")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("role")
        .setDescription("Server Role")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("card")
    .setDescription("Generate ID card")
    .addStringOption(o =>
      o.setName("id")
        .setDescription("UOI ID")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("lookup")
    .setDescription("Lookup member")
    .addStringOption(o =>
      o.setName("id")
        .setDescription("UOI ID")
        .setRequired(true)
    )
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
}

/* ================= BOT READY ================= */

client.once("ready", async () => {
  console.log("UOI SYSTEM ONLINE:", client.user.tag);
  await registerCommands();
});

/* ================= INTERACTIONS ================= */

client.on("interactionCreate", async interaction => {
  try {
    if (!interaction.isChatInputCommand()) return;

    await interaction.deferReply();

    const cmd = interaction.commandName;

    /* ===== REGISTER ===== */

    if (cmd === "register") {
      if (!isAdmin(interaction))
        return interaction.editReply("Admin only.");

      const name = interaction.options.getString("name");
      const role = interaction.options.getString("role");

      if (!name || !role)
        return interaction.editReply("Invalid input.");

      const id = generateID();

      await pool.query(
        `INSERT INTO members 
        (id, discord_id, name, role, status, issuedOn, internalId)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          id,
          interaction.user.id,
          name,
          role,
          "ACTIVE",
          new Date().toLocaleDateString(),
          "UOI-" + Date.now()
        ]
      );

      return interaction.editReply(`Registered.\nID: ${id}`);
    }

    /* ===== LOOKUP ===== */

    if (cmd === "lookup") {
      const id = interaction.options.getString("id");

      const result = await pool.query(
        "SELECT * FROM members WHERE id = $1",
        [id]
      );

      if (!result.rows.length)
        return interaction.editReply("Not found.");

      const m = result.rows[0];

      return interaction.editReply(
        `Name: ${m.name}\nRole: ${m.role}\nStatus: ${m.status}`
      );
    }

    /* ===== CARD ===== */

    if (cmd === "card") {
      const id = interaction.options.getString("id");

      const result = await pool.query(
        "SELECT * FROM members WHERE id = $1",
        [id]
      );

      if (!result.rows.length)
        return interaction.editReply("Not found.");

      const m = result.rows[0];

      const discordUser = await client.users.fetch(m.discord_id);

      const buffer = await createCard(m, discordUser);

      return interaction.editReply({
        files: [new AttachmentBuilder(buffer, { name: "uoi-card.png" })]
      });
    }

  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      interaction.editReply("System error.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
