require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ Brakuje TOKEN, CLIENT_ID lub GUILD_ID w Variables/Environment.");
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "sw-data.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_DATA = {
  settings: {
    logChannelId: null,
    nextNumber: 1
  },
  members: {}
};

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
      return structuredClone(DEFAULT_DATA);
    }
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      settings: { ...DEFAULT_DATA.settings, ...(data.settings || {}) },
      members: data.members || {}
    };
  } catch (err) {
    console.error("Błąd odczytu danych:", err);
    return structuredClone(DEFAULT_DATA);
  }
}

let db = loadData();

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

const RANKS = [
  "Kandydat",
  "Młodszy Funkcjonariusz",
  "Funkcjonariusz",
  "Starszy Funkcjonariusz",
  "Dowódca Zmiany",
  "Zastępca Naczelnika",
  "Naczelnik"
];

function rankIndex(rank) {
  return RANKS.indexOf(rank);
}

function getNextRank(rank) {
  const i = rankIndex(rank);
  return i >= 0 && i < RANKS.length - 1 ? RANKS[i + 1] : null;
}

function getPreviousRank(rank) {
  const i = rankIndex(rank);
  return i > 0 ? RANKS[i - 1] : null;
}

function formatMember(member) {
  return `<@${member.userId}>`;
}

function createEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: "Służba Więzienna • System kadrowy" });
}

async function sendLog(guild, embed) {
  if (!db.settings.logChannelId) return;

  const channel = await guild.channels.fetch(db.settings.logChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  await channel.send({ embeds: [embed] }).catch(() => {});
}

function hasStaffPermission(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

const commands = [
  new SlashCommandBuilder()
    .setName("sw-ustaw-logi")
    .setDescription("Ustaw kanał, na którym będą pojawiać się działania kadrowe.")
    .addChannelOption(o =>
      o.setName("kanal")
        .setDescription("Kanał logów")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("sw-dodaj")
    .setDescription("Dodaj funkcjonariusza do ewidencji Służby Więziennej.")
    .addUserOption(o => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true))
    .addStringOption(o =>
      o.setName("ranga")
        .setDescription("Ranga początkowa")
        .setRequired(false)
        .addChoices(...RANKS.map(r => ({ name: r, value: r })))
    ),

  new SlashCommandBuilder()
    .setName("sw-awans")
    .setDescription("Awansuj funkcjonariusza o jeden stopień.")
    .addUserOption(o => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true))
    .addStringOption(o => o.setName("powod").setDescription("Powód awansu").setRequired(false)),

  new SlashCommandBuilder()
    .setName("sw-degradacja")
    .setDescription("Degraduj funkcjonariusza o jeden stopień.")
    .addUserOption(o => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true))
    .addStringOption(o => o.setName("powod").setDescription("Powód degradacji").setRequired(false)),

  new SlashCommandBuilder()
    .setName("sw-wydalenie")
    .setDescription("Wydal funkcjonariusza ze Służby Więziennej.")
    .addUserOption(o => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true))
    .addStringOption(o => o.setName("powod").setDescription("Powód wydalenia").setRequired(true)),

  new SlashCommandBuilder()
    .setName("sw-nagana")
    .setDescription("Nadaj funkcjonariuszowi naganę.")
    .addUserOption(o => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true))
    .addStringOption(o => o.setName("powod").setDescription("Powód nagany").setRequired(true)),

  new SlashCommandBuilder()
    .setName("sw-plus")
    .setDescription("Dodaj funkcjonariuszowi punkt dodatni.")
    .addUserOption(o => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true))
    .addIntegerOption(o => o.setName("punkty").setDescription("Liczba punktów").setRequired(false).setMinValue(1).setMaxValue(100))
    .addStringOption(o => o.setName("powod").setDescription("Powód").setRequired(true)),

  new SlashCommandBuilder()
    .setName("sw-minus")
    .setDescription("Dodaj funkcjonariuszowi punkt ujemny.")
    .addUserOption(o => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true))
    .addIntegerOption(o => o.setName("punkty").setDescription("Liczba punktów").setRequired(false).setMinValue(1).setMaxValue(100))
    .addStringOption(o => o.setName("powod").setDescription("Powód").setRequired(true)),

  new SlashCommandBuilder()
    .setName("sw-kadra")
    .setDescription("Wyświetl listę funkcjonariuszy Służby Więziennej."),

  new SlashCommandBuilder()
    .setName("sw-info")
    .setDescription("Wyświetl kartę funkcjonariusza.")
    .addUserOption(o => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true)),

  new SlashCommandBuilder()
    .setName("sw-usun")
    .setDescription("Usuń funkcjonariusza z ewidencji.")
    .addUserOption(o => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(c => c.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
  console.log("✅ Komendy slash zostały zarejestrowane.");
}

client.once("ready", async () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
  console.log(`🏛️ Serwer ID: ${GUILD_ID}`);

  try {
    await registerCommands();
  } catch (err) {
    console.error("❌ Nie udało się zarejestrować komend:", err);
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const name = interaction.commandName;

  try {
    if (name === "sw-ustaw-logi") {
      if (!hasStaffPermission(interaction)) {
        return interaction.reply({ content: "❌ Potrzebujesz uprawnienia **Zarządzanie serwerem**.", ephemeral: true });
      }

      const channel = interaction.options.getChannel("kanal");
      db.settings.logChannelId = channel.id;
      saveData();

      return interaction.reply(`✅ Kanał logów ustawiony na ${channel}.`);
    }

    if (name === "sw-dodaj") {
      const user = interaction.options.getUser("osoba");
      const rank = interaction.options.getString("ranga") || "Kandydat";

      if (db.members[user.id]) {
        return interaction.reply({ content: "❌ Ta osoba jest już w ewidencji.", ephemeral: true });
      }

      const number = String(db.settings.nextNumber++).padStart(2, "0");

      db.members[user.id] = {
        userId: user.id,
        number,
        rank,
        plus: 0,
        minus: 0,
        reprimands: 0,
        joinedAt: new Date().toISOString()
      };

      saveData();

      const embed = createEmbed(
        "🟢 Przyjęcie do Służby Więziennej",
        `**Funkcjonariusz:** ${user}\n**Numer:** \`SW-${number}\`\n**Ranga:** ${rank}\n**Przyjął:** ${interaction.user}`
      );

      await sendLog(interaction.guild, embed);
      return interaction.reply({ embeds: [embed] });
    }

    const user = interaction.options.getUser("osoba");

    if (["sw-awans", "sw-degradacja", "sw-wydalenie", "sw-nagana", "sw-plus", "sw-minus", "sw-info"].includes(name)) {
      if (!db.members[user.id]) {
        return interaction.reply({ content: "❌ Ta osoba nie znajduje się w ewidencji. Użyj `/sw-dodaj`.", ephemeral: true });
      }
    }

    if (name === "sw-awans") {
      const data = db.members[user.id];
      const oldRank = data.rank;
      const newRank = getNextRank(oldRank);

      if (!newRank) {
        return interaction.reply({ content: "❌ Funkcjonariusz ma już najwyższą rangę.", ephemeral: true });
      }

      data.rank = newRank;
      saveData();

      const reason = interaction.options.getString("powod") || "Brak podanego powodu.";
      const embed = createEmbed(
        "⬆️ AWANS",
        `**Funkcjonariusz:** ${user} • \`SW-${data.number}\`\n**Było:** ${oldRank}\n**Jest:** ${newRank}\n**Powód:** ${reason}\n**Wykonał:** ${interaction.user}`
      );

      await sendLog(interaction.guild, embed);
      return interaction.reply({ embeds: [embed] });
    }

    if (name === "sw-degradacja") {
      const data = db.members[user.id];
      const oldRank = data.rank;
      const newRank = getPreviousRank(oldRank);

      if (!newRank) {
        return interaction.reply({ content: "❌ Funkcjonariusz ma już najniższą rangę.", ephemeral: true });
      }

      data.rank = newRank;
      saveData();

      const reason = interaction.options.getString("powod") || "Brak podanego powodu.";
      const embed = createEmbed(
        "⬇️ DEGRADACJA",
        `**Funkcjonariusz:** ${user} • \`SW-${data.number}\`\n**Było:** ${oldRank}\n**Jest:** ${newRank}\n**Powód:** ${reason}\n**Wykonał:** ${interaction.user}`
      );

      await sendLog(interaction.guild, embed);
      return interaction.reply({ embeds: [embed] });
    }

    if (name === "sw-wydalenie") {
      const data = db.members[user.id];
      const reason = interaction.options.getString("powod");

      delete db.members[user.id];
      saveData();

      const embed = createEmbed(
        "🔴 WYDALENIE ZE SŁUŻBY",
        `**Funkcjonariusz:** ${user} • \`SW-${data.number}\`\n**Ostatnia ranga:** ${data.rank}\n**Powód:** ${reason}\n**Wykonał:** ${interaction.user}`
      );

      await sendLog(interaction.guild, embed);
      return interaction.reply({ embeds: [embed] });
    }

    if (name === "sw-nagana") {
      const data = db.members[user.id];
      const reason = interaction.options.getString("powod");
      data.reprimands += 1;
      saveData();

      const embed = createEmbed(
        "⚠️ NAGANA",
        `**Funkcjonariusz:** ${user} • \`SW-${data.number}\`\n**Ranga:** ${data.rank}\n**Nagana nr:** ${data.reprimands}\n**Powód:** ${reason}\n**Nadał:** ${interaction.user}`
      );

      await sendLog(interaction.guild, embed);
      return interaction.reply({ embeds: [embed] });
    }

    if (name === "sw-plus" || name === "sw-minus") {
      const data = db.members[user.id];
      const points = interaction.options.getInteger("punkty") || 1;
      const reason = interaction.options.getString("powod");

      if (name === "sw-plus") data.plus += points;
      else data.minus += points;

      saveData();

      const type = name === "sw-plus" ? "➕ PLUS" : "➖ MINUS";
      const total = name === "sw-plus" ? data.plus : data.minus;

      const embed = createEmbed(
        type,
        `**Funkcjonariusz:** ${user} • \`SW-${data.number}\`\n**Punkty:** ${points}\n**Łącznie:** ${total}\n**Powód:** ${reason}\n**Nadał:** ${interaction.user}`
      );

      await sendLog(interaction.guild, embed);
      return interaction.reply({ embeds: [embed] });
    }

    if (name === "sw-info") {
      const data = db.members[user.id];

      const embed = createEmbed(
        `📋 Karta funkcjonariusza — SW-${data.number}`,
        `**Osoba:** ${user}\n**Ranga:** ${data.rank}\n**Plusy:** ${data.plus}\n**Minusy:** ${data.minus}\n**Nagany:** ${data.reprimands}\n**Data przyjęcia:** <t:${Math.floor(new Date(data.joinedAt).getTime() / 1000)}:d>`
      );

      return interaction.reply({ embeds: [embed] });
    }

    if (name === "sw-kadra") {
      const list = Object.values(db.members).sort((a, b) => Number(a.number) - Number(b.number));

      if (!list.length) {
        return interaction.reply("📋 Ewidencja jest obecnie pusta.");
      }

      const lines = list.map(m =>
        `**SW-${m.number}** — <@${m.userId}> — **${m.rank}** | ➕ ${m.plus} | ➖ ${m.minus} | ⚠️ ${m.reprimands}`
      );

      const embed = createEmbed(
        "🛡️ KADRA SŁUŻBY WIĘZIENNEJ",
        lines.join("\n").slice(0, 3900)
      );

      return interaction.reply({ embeds: [embed] });
    }

    if (name === "sw-usun") {
      if (!hasStaffPermission(interaction)) {
        return interaction.reply({ content: "❌ Potrzebujesz uprawnienia **Zarządzanie serwerem**.", ephemeral: true });
      }

      if (!db.members[user.id]) {
        return interaction.reply({ content: "❌ Tej osoby nie ma w ewidencji.", ephemeral: true });
      }

      const data = db.members[user.id];
      delete db.members[user.id];
      saveData();

      return interaction.reply(`🗑️ Usunięto ${user} (\`SW-${data.number}\`) z ewidencji.`);
    }

  } catch (err) {
    console.error(err);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: "❌ Wystąpił błąd podczas wykonywania komendy.", ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: "❌ Wystąpił błąd podczas wykonywania komendy.", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(TOKEN);

