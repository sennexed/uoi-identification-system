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
async function createCard(member, interaction) {
  const canvas = createCanvas(900, 500);
  const ctx = canvas.getContext("2d");

  // ===== BACKGROUND =====
  const gradient = ctx.createLinearGradient(0, 0, 900, 500);
  gradient.addColorStop(0, "#dbeafe");  // light blue
  gradient.addColorStop(1, "#ffffff");  // white
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ===== HEADER BAR =====
  ctx.fillStyle = "#3b82f6"; // blue
  ctx.fillRect(0, 0, 900, 80);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px Sans";
  ctx.fillText("UNION OF INDIANS", 40, 50);

  ctx.font = "18px Sans";
  ctx.fillText("OFFICIAL IDENTIFICATION CARD", 40, 70);

  // ===== PFP (LEFT SIDE) =====
  const avatarURL = interaction.user.displayAvatarURL({
    extension: "png",
    size: 512
  });

  const avatar = await loadImage(avatarURL);

  const avatarSize = 180;
  const avatarX = 60;
  const avatarY = 150;

  ctx.save();
  ctx.beginPath();
  ctx.arc(
    avatarX + avatarSize / 2,
    avatarY + avatarSize / 2,
    avatarSize / 2,
    0,
    Math.PI * 2
  );
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  ctx.restore();

  // Circle border
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(
    avatarX + avatarSize / 2,
    avatarY + avatarSize / 2,
    avatarSize / 2,
    0,
    Math.PI * 2
  );
  ctx.stroke();

  // ===== MEMBER DETAILS (RIGHT SIDE) =====
  const textStartX = 300;
  let y = 180;

  ctx.fillStyle = "#1e3a8a";
  ctx.font = "bold 40px Sans";
  ctx.fillText(member.name, textStartX, y);

  y += 60;

  ctx.font = "28px Sans";
  ctx.fillStyle = "#1f2937";
  ctx.fillText(`Role: ${member.role}`, textStartX, y);

  y += 45;
  ctx.fillText(`Status: ${member.status}`, textStartX, y);

  y += 45;

  ctx.fillStyle = "#2563eb";
  ctx.font = "bold 30px Monospace";
  ctx.fillText(`ID: ${member.id}`, textStartX, y);

  y += 45;

  ctx.font = "22px Sans";
  ctx.fillStyle = "#475569";
  ctx.fillText(`Issued: ${member.issuedon || member.issuedOn}`, textStartX, y);

  y += 35;
  ctx.fillText(`Ref: ${member.internalid || member.internalId}`, textStartX, y);

  // ===== FOOTER LINE =====
  ctx.fillStyle = "#3b82f6";
  ctx.fillRect(0, 480, 900, 20);

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
