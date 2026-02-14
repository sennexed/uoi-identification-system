import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  AttachmentBuilder,
  REST,
  Routes
} from "discord.js";
import pkg from "pg";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const { Pool } = pkg;

/* ================= ENV ================= */

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const DATABASE_URL = process.env.DATABASE_URL;

if (!TOKEN || !CLIENT_ID || !DATABASE_URL) {
  console.error("Missing environment variables.");
  process.exit(1);
}

/* ================= DATABASE ================= */

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await pool.query(`
CREATE TABLE IF NOT EXISTS members (
  discord_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  issued_on TEXT NOT NULL,
  internal_id TEXT NOT NULL
);
`);

/* ================= DISCORD CLIENT ================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ================= CARD GENERATOR ================= */

async function createCard(user, memberData) {
  const canvas = createCanvas(900, 300);
  const ctx = canvas.getContext("2d");

  // Background (light blue + white)
  ctx.fillStyle = "#eaf6ff";
  ctx.fillRect(0, 0, 900, 300);

  ctx.fillStyle = "#2196f3";
  ctx.fillRect(0, 0, 900, 70);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Sans";
  ctx.fillText("UNION OF INDIANS", 30, 45);

  ctx.fillStyle = "#000000";

  // Load PFP
  const avatarURL = user.displayAvatarURL({ extension: "png", size: 256 });
  const avatar = await loadImage(avatarURL);

  // Circular avatar
  const avatarSize = 160;
  const avatarX = 40;
  const avatarY = 100;

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

  // Text section
  ctx.font = "bold 24px Sans";
  ctx.fillText(memberData.name, 250, 120);

  ctx.font = "20px Sans";
  ctx.fillText(`Role: ${memberData.role}`, 250, 160);
  ctx.fillText(`Status: ${memberData.status}`, 250, 190);
  ctx.fillText(`Issued: ${memberData.issued_on}`, 250, 220);
  ctx.fillText(`Internal ID: ${memberData.internal_id}`, 250, 250);

  return canvas.toBuffer();
}

/* ================= COMMANDS ================= */

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Generate your UOI ID card")
    .addStringOption(option =>
      option.setName("role")
        .setDescription("Your role in UOI")
        .setRequired(true)
    )
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function registerCommands() {
  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );
}

/* ================= READY ================= */

client.once("clientReady", async () => {
  console.log(`UOI SYSTEM ONLINE: ${client.user.tag}`);
  await registerCommands();
});

/* ================= INTERACTIONS ================= */

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "setup") {
    await interaction.deferReply();

    const roleInput = interaction.options.getString("role");
    const user = interaction.user;

    const issuedDate = new Date().toLocaleDateString();
    const internalId = `UOI-${Date.now()}`;

    const memberData = {
      discord_id: user.id,
      name: user.username,
      role: roleInput,
      status: "ACTIVE",
      issued_on: issuedDate,
      internal_id: internalId
    };

    await pool.query(
      `INSERT INTO members(discord_id, name, role, status, issued_on, internal_id)
       VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT (discord_id)
       DO UPDATE SET
         role = EXCLUDED.role,
         status = EXCLUDED.status;`,
      [
        memberData.discord_id,
        memberData.name,
        memberData.role,
        memberData.status,
        memberData.issued_on,
        memberData.internal_id
      ]
    );

    const buffer = await createCard(user, memberData);
    const attachment = new AttachmentBuilder(buffer, { name: "uoi-id.png" });

    await interaction.editReply({ files: [attachment] });
  }
});

/* ================= LOGIN ================= */

client.login(TOKEN);
