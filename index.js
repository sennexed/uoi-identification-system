import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  AttachmentBuilder
} from "discord.js";

import { createCanvas } from "@napi-rs/canvas";
import dotenv from "dotenv";
import Database from "better-sqlite3";

dotenv.config();

/* ============================= */
/*           CLIENT              */
/* ============================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ============================= */
/*          DATABASE             */
/* ============================= */

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

/* ============================= */
/*        HELPER FUNCTIONS       */
/* ============================= */

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
  if (channel) channel.send(`🛡️ ${message}`).catch(() => {});
}

/* ============================= */
/*        CARD GENERATION        */
/* ============================= */

function createCard(member) {
  const canvas = createCanvas(800, 500);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, 800, 500);

  // Indian Flag Accent
  const gradient = ctx.createLinearGradient(0, 0, 800, 0);
  gradient.addColorStop(0, "#ff9933");
  gradient.addColorStop(0.5, "#ffffff");
  gradient.addColorStop(1, "#138808");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 800, 12);

  // Header
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px Arial";
  ctx.fillText("UNION OF INDIANS", 40, 70);
  ctx.font = "20px Arial";
  ctx.fillText("OFFICIAL IDENTIFICATION CARD", 40, 105);

  // Name
  ctx.font = "bold 42px Arial";
  ctx.fillStyle = "#f8fafc";
  ctx.fillText(member.name, 40, 190);

  // ID
  ctx.font = "28px monospace";
  ctx.fillStyle = "#fbbf24";
  ctx.fillText("ID: " + member.id, 40, 240);

  // Details
  ctx.font = "24px Arial";
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText("Role: " + member.role, 40, 300);
  ctx.fillText("Status: " + member.status, 40, 340);

  ctx.font = "18px Arial";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Issued: " + member.issuedOn, 40, 390);
  ctx.fillText("Internal Ref: " + member.internalId, 40, 420);

  return canvas.toBuffer("image/png");
}

/* ============================= */
/*         SLASH COMMANDS        */
/* ============================= */

const commands = [

  new SlashCommandBuilder()
    .setName("register")
    .setDescription("Register new UOI member")
    .addStringOption(o =>
      o.setName("name")
        .setDescription("Full name of member")
        .setRequired(true))
    .addStringOption(o =>
      o.setName("role")
        .setDescription("Server role of member")
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verify UOI ID")
    .addStringOption(o =>
      o.setName("id")
        .setDescription("UOI ID number")
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName("card")
    .setDescription("Generate graphical ID card")
    .addStringOption(o =>
      o.setName("id")
        .setDescription("UOI ID number")
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName("lookup")
    .setDescription("Lookup member by ID")
    .addStringOption(o =>
      o.setName("id")
        .setDescription("UOI ID number")
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName("setstatus")
    .setDescription("Change member status (Admin only)")
    .addStringOption(o =>
      o.setName("id")
        .setDescription("UOI ID number")
        .setRequired(true))
    .addStringOption(o =>
      o.setName("status")
        .setDescription("ACTIVE / SUSPENDED / REVOKED")
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName("setrole")
    .setDescription("Change member role (Admin only)")
    .addStringOption(o =>
      o.setName("id")
        .setDescription("UOI ID number")
        .setRequired(true))
    .addStringOption(o =>
      o.setName("role")
        .setDescription("New role")
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName("delete")
    .setDescription("Delete member (Admin only)")
    .addStringOption(o =>
      o.setName("id")
        .setDescription("UOI ID number")
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName("list")
    .setDescription("List all members (Admin only)")

].map(c => c.toJSON());

/* ============================= */
/*      REGISTER COMMANDS        */
/* ============================= */

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
}

/* ============================= */
/*           EVENTS              */
/* ============================= */

client.once("clientReady", async () => {
  console.log("🟢 UOI SYSTEM ONLINE:", client.user.tag);
  await registerCommands();
  console.log("✅ Slash commands registered.");
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await interaction.deferReply();

    const cmd = interaction.commandName;

    /* REGISTER */
    if (cmd === "register") {
      if (!isAdmin(interaction))
        return interaction.editReply("❌ Admin only.");

      const id = generateID();
      const name = interaction.options.getString("name");
      const role = interaction.options.getString("role");

      db.prepare(`INSERT INTO members VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, name, role, "ACTIVE",
             new Date().toLocaleDateString(),
             "UOI-" + Date.now());

      logAction(`Member Registered: ${name} (${id})`);
      return interaction.editReply(`✅ Registered.\nID: ${id}`);
    }

    /* VERIFY + LOOKUP */
    if (cmd === "verify" || cmd === "lookup") {
      const id = interaction.options.getString("id");
      const m = db.prepare("SELECT * FROM members WHERE id = ?").get(id);

      if (!m) return interaction.editReply("❌ Not found.");

      return interaction.editReply(
        `👤 Name: ${m.name}\n🏷️ Role: ${m.role}\n📌 Status: ${m.status}`
      );
    }

    /* CARD */
    if (cmd === "card") {
      const id = interaction.options.getString("id");
      const m = db.prepare("SELECT * FROM members WHERE id = ?").get(id);

      if (!m) return interaction.editReply("❌ Not found.");

      const buffer = createCard(m);

      return interaction.editReply({
        files: [new AttachmentBuilder(buffer, { name: "uoi-card.png" })]
      });
    }

    /* SET STATUS */
    if (cmd === "setstatus") {
      if (!isAdmin(interaction))
        return interaction.editReply("❌ Admin only.");

      const id = interaction.options.getString("id");
      const status = interaction.options.getString("status").toUpperCase();

      db.prepare("UPDATE members SET status = ? WHERE id = ?")
        .run(status, id);

      logAction(`Status Updated: ${id} → ${status}`);
      return interaction.editReply("✅ Status updated.");
    }

    /* SET ROLE */
    if (cmd === "setrole") {
      if (!isAdmin(interaction))
        return interaction.editReply("❌ Admin only.");

      const id = interaction.options.getString("id");
      const role = interaction.options.getString("role");

      db.prepare("UPDATE members SET role = ? WHERE id = ?")
        .run(role, id);

      logAction(`Role Updated: ${id} → ${role}`);
      return interaction.editReply("✅ Role updated.");
    }

    /* DELETE */
    if (cmd === "delete") {
      if (!isAdmin(interaction))
        return interaction.editReply("❌ Admin only.");

      const id = interaction.options.getString("id");
      db.prepare("DELETE FROM members WHERE id = ?").run(id);

      logAction(`Member Deleted: ${id}`);
      return interaction.editReply("🗑️ Member deleted.");
    }

    /* LIST */
    if (cmd === "list") {
      if (!isAdmin(interaction))
        return interaction.editReply("❌ Admin only.");

      const rows = db.prepare("SELECT * FROM members").all();
      if (!rows.length) return interaction.editReply("No members.");

      const text = rows.map(r =>
        `${r.id} | ${r.name} | ${r.status}`
      ).join("\n");

      return interaction.editReply("```\n" + text + "\n```");
    }

  } catch (err) {
    console.error(err);
    return interaction.editReply("⚠️ Unexpected error.");
  }
});

client.login(process.env.DISCORD_TOKEN);
