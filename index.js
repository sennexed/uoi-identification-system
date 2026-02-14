import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  AttachmentBuilder
} from "discord.js";

import { createCanvas, loadImage } from "@napi-rs/canvas";
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pkg;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function generateID() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function isAdmin(interaction) {
  return interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID);
}

async function createCard(member, user) {
  const canvas = createCanvas(900, 500);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#e6f4ff";
  ctx.fillRect(0, 0, 900, 500);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(20, 20, 860, 460);

  // Header
  ctx.fillStyle = "#0077cc";
  ctx.fillRect(20, 20, 860, 80);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px Arial";
  ctx.fillText("UNION OF INDIANS", 40, 70);

  ctx.font = "20px Arial";
  ctx.fillText("Official Identification Card", 600, 70);

  // Avatar Left Side
  const avatarURL = user.displayAvatarURL({ extension: "png", size: 256 });
  const avatar = await loadImage(avatarURL);

  ctx.save();
  ctx.beginPath();
  ctx.arc(150, 260, 100, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, 50, 160, 200, 200);
  ctx.restore();

  // Member Info
  ctx.fillStyle = "#000000";
  ctx.font = "bold 40px Arial";
  ctx.fillText(member.name, 300, 200);

  ctx.font = "28px Arial";
  ctx.fillText(`UOI ID: ${member.id}`, 300, 250);
  ctx.fillText(`Role: ${member.role}`, 300, 290);
  ctx.fillText(`Status: ${member.status}`, 300, 330);

  ctx.font = "20px Arial";
  ctx.fillStyle = "#555";
  ctx.fillText(`Issued: ${member.issued_on}`, 300, 380);
  ctx.fillText(`Internal Ref: ${member.internal_id}`, 300, 410);

  return canvas.toBuffer("image/png");
}

const commands = [
  new SlashCommandBuilder()
    .setName("register")
    .setDescription("Register new UOI member")
    .addUserOption(o => o.setName("user").setDescription("Discord user").setRequired(true))
    .addStringOption(o => o.setName("name").setDescription("Full name").setRequired(true))
    .addStringOption(o => o.setName("role").setDescription("Role").setRequired(true)),

  new SlashCommandBuilder()
    .setName("card")
    .setDescription("Generate ID card")
    .addStringOption(o => o.setName("id").setDescription("UOI ID").setRequired(true)),

  new SlashCommandBuilder()
    .setName("lookup")
    .setDescription("Lookup member")
    .addStringOption(o => o.setName("id").setDescription("UOI ID").setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
}

client.once("clientReady", async () => {
  console.log(`UOI SYSTEM ONLINE: ${client.user.tag}`);
  await registerCommands();
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply();

  const { commandName } = interaction;

  if (commandName === "register") {
    if (!isAdmin(interaction))
      return interaction.editReply("Admin only.");

    const user = interaction.options.getUser("user");
    const name = interaction.options.getString("name");
    const role = interaction.options.getString("role");

    const id = generateID();
    const issued = new Date().toLocaleDateString();
    const internal = "UOI-" + Date.now();

    await pool.query(
      `INSERT INTO members 
      (id, discord_id, name, role, status, issued_on, internal_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, user.id, name, role, "ACTIVE", issued, internal]
    );

    return interaction.editReply(`✅ Registered.\nUOI ID: ${id}`);
  }

  if (commandName === "lookup") {
    const id = interaction.options.getString("id");

    const res = await pool.query(
      "SELECT * FROM members WHERE id=$1",
      [id]
    );

    if (!res.rows.length)
      return interaction.editReply("Not found.");

    const m = res.rows[0];

    return interaction.editReply(
      `Name: ${m.name}\nRole: ${m.role}\nStatus: ${m.status}`
    );
  }

  if (commandName === "card") {
    const id = interaction.options.getString("id");

    const res = await pool.query(
      "SELECT * FROM members WHERE id=$1",
      [id]
    );

    if (!res.rows.length)
      return interaction.editReply("Not found.");

    const member = res.rows[0];

    const user = await client.users.fetch(member.discord_id);

    const buffer = await createCard(member, user);

    return interaction.editReply({
      files: [new AttachmentBuilder(buffer, { name: "uoi-card.png" })]
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
