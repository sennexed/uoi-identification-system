import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  AttachmentBuilder
} from "discord.js";

import dotenv from "dotenv";
import pkg from "pg";
import { createCanvas, loadImage } from "@napi-rs/canvas";

dotenv.config();
const { Pool } = pkg;

/* ================= DATABASE ================= */

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

/* ================= DISCORD ================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

function generateID() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function isAdmin(interaction) {
  return interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID);
}

function logAction(message) {
  const channel = client.channels.cache.get(process.env.LOG_CHANNEL_ID);
  if (channel) channel.send(`📘 ${message}`);
}

/* ================= CARD BUILDER ================= */

async function createCard(member, avatarURL) {
  const canvas = createCanvas(900, 550);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, 900, 550);

  // Top accent
  const gradient = ctx.createLinearGradient(0, 0, 900, 0);
  gradient.addColorStop(0, "#ff9933");
  gradient.addColorStop(0.5, "#ffffff");
  gradient.addColorStop(1, "#138808");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 900, 12);

  // Header
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px Arial";
  ctx.fillText("UNION OF INDIANS", 50, 80);

  ctx.font = "24px Arial";
  ctx.fillText("OFFICIAL IDENTIFICATION CARD", 50, 120);

  // Avatar (circular)
  if (avatarURL) {
    try {
      const avatar = await loadImage(avatarURL);
      const size = 220;
      const x = 600;
      const y = 150;

      ctx.save();
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(avatar, x, y, size, size);
      ctx.restore();
    } catch {}
  }

  // Member Info
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px Arial";
  ctx.fillText(member.name, 50, 200);

  ctx.font = "32px monospace";
  ctx.fillStyle = "#fbbf24";
  ctx.fillText("ID: " + member.id, 50, 260);

  ctx.font = "28px Arial";
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Role: " + member.role, 50, 320);
  ctx.fillText("Status: " + member.status, 50, 360);

  ctx.font = "22px Arial";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Issued: " + member.issuedOn, 50, 420);
  ctx.fillText("Internal Ref: " + member.internalId, 50, 460);

  return canvas.toBuffer("image/png");
}

/* ================= SLASH COMMANDS ================= */
const commands = [

  new SlashCommandBuilder()
    .setName("register")
    .setDescription("Register a new UOI member")
    .addStringOption(o =>
      o.setName("name")
       .setDescription("Member full name")
       .setRequired(true))
    .addStringOption(o =>
      o.setName("role")
       .setDescription("Member role")
       .setRequired(true)),

  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verify a UOI ID")
    .addStringOption(o =>
      o.setName("id")
       .setDescription("Member ID")
       .setRequired(true)),

  new SlashCommandBuilder()
    .setName("card")
    .setDescription("Generate ID card")
    .addStringOption(o =>
      o.setName("id")
       .setDescription("Member ID")
       .setRequired(true)),

  new SlashCommandBuilder()
    .setName("lookup")
    .setDescription("Lookup member by ID")
    .addStringOption(o =>
      o.setName("id")
       .setDescription("Member ID")
       .setRequired(true)),

  new SlashCommandBuilder()
    .setName("setstatus")
    .setDescription("Change member status")
    .addStringOption(o =>
      o.setName("id")
       .setDescription("Member ID")
       .setRequired(true))
    .addStringOption(o =>
      o.setName("status")
       .setDescription("New status (ACTIVE / SUSPENDED / REVOKED)")
       .setRequired(true)),

  new SlashCommandBuilder()
    .setName("setrole")
    .setDescription("Change member role")
    .addStringOption(o =>
      o.setName("id")
       .setDescription("Member ID")
       .setRequired(true))
    .addStringOption(o =>
      o.setName("role")
       .setDescription("New role")
       .setRequired(true)),

  new SlashCommandBuilder()
    .setName("delete")
    .setDescription("Delete a member")
    .addStringOption(o =>
      o.setName("id")
       .setDescription("Member ID")
       .setRequired(true)),

  new SlashCommandBuilder()
    .setName("list")
    .setDescription("List all members")

].map(c => c.toJSON());

/* ================= BOT READY ================= */

client.once("clientReady", async () => {
  console.log("UOI SYSTEM ONLINE:", client.user.tag);
  await registerCommands();
});

/* ================= COMMAND HANDLER ================= */

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply();

  const cmd = interaction.commandName;

  if (cmd === "register") {
    if (!isAdmin(interaction))
      return interaction.editReply("❌ Admin only.");

    const id = generateID();
    const name = interaction.options.getString("name");
    const role = interaction.options.getString("role");

    const issuedOn = new Date().toLocaleDateString();
    const internalId = "UOI-" + Date.now();

    await pool.query(
      `INSERT INTO members VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, name, role, "ACTIVE", issuedOn, internalId]
    );

    logAction(`Registered ${name} (${id})`);
    return interaction.editReply(`✅ Registered.\nID: ${id}`);
  }

  if (cmd === "verify") {
    const id = interaction.options.getString("id");
    const result = await pool.query(
      `SELECT * FROM members WHERE id = $1`,
      [id]
    );

    if (!result.rows.length)
      return interaction.editReply("❌ Not found.");

    const m = result.rows[0];

    return interaction.editReply(
      `**Name:** ${m.name}\n**Role:** ${m.role}\n**Status:** ${m.status}`
    );
  }

  if (cmd === "card") {
    const id = interaction.options.getString("id");
    const result = await pool.query(
      `SELECT * FROM members WHERE id = $1`,
      [id]
    );

    if (!result.rows.length)
      return interaction.editReply("❌ Not found.");

    const m = result.rows[0];

    const avatarURL = interaction.user.displayAvatarURL({
      extension: "png",
      size: 512
    });

    const buffer = await createCard(m, avatarURL);

    return interaction.editReply({
      files: [new AttachmentBuilder(buffer, { name: "uoi-card.png" })]
    });
  }

  if (cmd === "setstatus") {
    if (!isAdmin(interaction))
      return interaction.editReply("❌ Admin only.");

    const id = interaction.options.getString("id");
    const status = interaction.options.getString("status");

    await pool.query(
      `UPDATE members SET status = $1 WHERE id = $2`,
      [status, id]
    );

    logAction(`Status updated: ${id} → ${status}`);
    return interaction.editReply("✅ Status updated.");
  }

  if (cmd === "setrole") {
    if (!isAdmin(interaction))
      return interaction.editReply("❌ Admin only.");

    const id = interaction.options.getString("id");
    const role = interaction.options.getString("role");

    await pool.query(
      `UPDATE members SET role = $1 WHERE id = $2`,
      [role, id]
    );

    logAction(`Role updated: ${id} → ${role}`);
    return interaction.editReply("✅ Role updated.");
  }

  if (cmd === "delete") {
    if (!isAdmin(interaction))
      return interaction.editReply("❌ Admin only.");

    const id = interaction.options.getString("id");

    await pool.query(
      `DELETE FROM members WHERE id = $1`,
      [id]
    );

    logAction(`Deleted member ${id}`);
    return interaction.editReply("🗑 Member deleted.");
  }

  if (cmd === "list") {
    if (!isAdmin(interaction))
      return interaction.editReply("❌ Admin only.");

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
