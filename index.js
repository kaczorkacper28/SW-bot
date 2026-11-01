require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const { registerOsadzeniModule } = require("./osadzeni");
const { registerWezwanieModule } = require("./modules/wezwanie");
const { registerRaportModule } = require("./modules/raport");
const { registerStopnieModule } = require("./modules/stopnie");
const { registerDokumentyModule } = require("./modules/dokumenty");
const { registerPropozycjeModule } = require("./modules/propozycje");
const { registerWyplatyModule } = require("./modules/wyplaty");

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ Brakuje TOKEN, CLIENT_ID lub GUILD_ID w Environment Variables.");
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "sw-data.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_DATA = {
  settings: { logChannelId: null },
  members: {},
};

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2), "utf8");
      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      settings: { ...DEFAULT_DATA.settings, ...(data.settings || {}) },
      members: data.members || {},
    };
  } catch (error) {
    console.error("❌ Błąd odczytu bazy danych:", error);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

let db = loadData();

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
  } catch (error) {
    console.error("❌ Błąd zapisu bazy danych:", error);
  }
}

// ======================================================
// RANGI I KORPUSY SŁUŻBY WIĘZIENNEJ
// ======================================================

const RANKS = [
  "Rekrut",
  "Szeregowy",
  "Starszy szeregowy",
  "Kapral",
  "Starszy kapral",
  "Plutonowy",
  "Sierżant",
  "Starszy sierżant",
  "Sierżant sztabowy",
  "Chorąży",
  "Starszy chorąży",
  "Chorąży sztabowy",
  "Podporucznik",
  "Porucznik",
  "Kapitan",
  "Major",
  "Podpułkownik",
  "Pułkownik",
  "Generał",
  "Generał inspektor",
];

const CORPS = {
  SZEREGOWYCH: "Korpus Szeregowych",
  PODOFICEROW: "Korpus Podoficerów",
  CHORAZY: "Korpus Chorąży",
  OFICEROW_MLODSZYCH: "Korpus Oficerów Młodszych",
  OFICEROW_STARSZYCH: "Korpus Oficerów Starszych",
  GENERALOW: "Korpus Generałów",
};

function getCorps(rank) {
  if (["Rekrut", "Szeregowy", "Starszy szeregowy"].includes(rank)) {
    return CORPS.SZEREGOWYCH;
  }

  if ([
    "Kapral",
    "Starszy kapral",
    "Plutonowy",
    "Sierżant",
    "Starszy sierżant",
    "Sierżant sztabowy",
  ].includes(rank)) {
    return CORPS.PODOFICEROW;
  }

  if (["Chorąży", "Starszy chorąży", "Chorąży sztabowy"].includes(rank)) {
    return CORPS.CHORAZY;
  }

  if (["Podporucznik", "Porucznik", "Kapitan"].includes(rank)) {
    return CORPS.OFICEROW_MLODSZYCH;
  }

  if (["Major", "Podpułkownik", "Pułkownik"].includes(rank)) {
    return CORPS.OFICEROW_STARSZYCH;
  }

  if (["Generał", "Generał inspektor"].includes(rank)) {
    return CORPS.GENERALOW;
  }

  return CORPS.GENERALOW;
}

function rankIndex(rank) {
  return RANKS.indexOf(rank);
}

function getNextRank(rank) {
  const index = rankIndex(rank);
  return index >= 0 && index < RANKS.length - 1 ? RANKS[index + 1] : null;
}

function getPreviousRank(rank) {
  const index = rankIndex(rank);
  return index > 0 ? RANKS[index - 1] : null;
}

function formatNumber(number) {
  return String(number).padStart(2, "0");
}

function isNumberTaken(number) {
  return Object.values(db.members).some((member) => Number(member.number) === Number(number));
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

  try {
    const channel = await guild.channels.fetch(db.settings.logChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("❌ Nie udało się wysłać logu:", error);
  }
}

function hasStaffPermission(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const osadzeniCommands = registerOsadzeniModule(client);
const wezwanieCommands = registerWezwanieModule(client);
const raportCommands = registerRaportModule(client);
const stopnieCommands = registerStopnieModule(client);
const dokumentyCommands = registerDokumentyModule(client);
const propozycjeCommands = registerPropozycjeModule(client);
const wyplatyCommands = registerWyplatyModule(client);

const commands = [
  new SlashCommandBuilder()
    .setName("sw-ustaw-logi")
    .setDescription("Ustaw kanał, na którym będą pojawiać się działania kadrowe.")
    .addChannelOption((o) => o.setName("kanal").setDescription("Kanał logów").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("sw-dodaj")
    .setDescription("Dodaj funkcjonariusza do ewidencji Służby Więziennej.")
    .addUserOption((o) => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true))
    .addIntegerOption((o) => o.setName("numer").setDescription("Numer SW, np. 1 = SW-01").setRequired(true).setMinValue(1).setMaxValue(9999))
    .addStringOption((o) => o.setName("ranga").setDescription("Ranga początkowa").setRequired(false).addChoices(...RANKS.map((rank) => ({ name: rank, value: rank })))),

  new SlashCommandBuilder()
    .setName("sw-awans")
    .setDescription("Awansuj funkcjonariusza o jeden stopień.")
    .addUserOption((o) => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true))
    .addStringOption((o) => o.setName("powod").setDescription("Powód awansu").setRequired(false)),

  new SlashCommandBuilder()
    .setName("sw-degradacja")
    .setDescription("Degraduj funkcjonariusza o jeden stopień.")
    .addUserOption((o) => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true))
    .addStringOption((o) => o.setName("powod").setDescription("Powód degradacji").setRequired(false)),

  new SlashCommandBuilder()
    .setName("sw-wydalenie")
    .setDescription("Wydal funkcjonariusza ze Służby Więziennej.")
    .addUserOption((o) => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true))
    .addStringOption((o) => o.setName("powod").setDescription("Powód wydalenia").setRequired(true)),

  new SlashCommandBuilder()
    .setName("sw-nagana")
    .setDescription("Nadaj funkcjonariuszowi naganę.")
    .addUserOption((o) => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true))
    .addStringOption((o) => o.setName("powod").setDescription("Powód nagany").setRequired(true)),

  new SlashCommandBuilder()
    .setName("sw-plus")
    .setDescription("Dodaj funkcjonariuszowi punkt dodatni.")
    .addUserOption((o) => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true))
    .addStringOption((o) => o.setName("powod").setDescription("Powód").setRequired(true))
    .addIntegerOption((o) => o.setName("punkty").setDescription("Liczba punktów").setRequired(false).setMinValue(1).setMaxValue(100)),

  new SlashCommandBuilder()
    .setName("sw-minus")
    .setDescription("Dodaj funkcjonariuszowi punkt ujemny.")
    .addUserOption((o) => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true))
    .addStringOption((o) => o.setName("powod").setDescription("Powód").setRequired(true))
    .addIntegerOption((o) => o.setName("punkty").setDescription("Liczba punktów").setRequired(false).setMinValue(1).setMaxValue(100)),

  new SlashCommandBuilder().setName("sw-kadra").setDescription("Wyświetl listę funkcjonariuszy Służby Więziennej."),

  new SlashCommandBuilder()
    .setName("sw-info")
    .setDescription("Wyświetl kartę funkcjonariusza.")
    .addUserOption((o) => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true)),

  new SlashCommandBuilder()
    .setName("sw-usun")
    .setDescription("Usuń funkcjonariusza z ewidencji.")
    .addUserOption((o) => o.setName("osoba").setDescription("Funkcjonariusz").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map((command) => command.toJSON()).concat(osadzeniCommands, wezwanieCommands, raportCommands, stopnieCommands, dokumentyCommands, propozycjeCommands, wyplatyCommands);

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const payoutGuildId = process.env.SW_GUILD_ID || GUILD_ID;
  const mainCommands = payoutGuildId === GUILD_ID
    ? commands
    : commands.filter(command => command.name !== "sw-wyplata");
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: mainCommands });
  if (payoutGuildId !== GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, payoutGuildId), { body: wyplatyCommands });
    console.log("✅ Komenda wypłat SW zarejestrowana na osobnym serwerze.");
  }
  console.log("✅ Komendy slash zostały zarejestrowane.");
}

client.once("ready", async () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
  console.log(`🏛️ Serwer ID: ${GUILD_ID}`);
  try {
    await registerCommands();
  } catch (error) {
    console.error("❌ Nie udało się zarejestrować komend:");
    console.error(error);
  }
});

client.on("interactionCreate", async (interaction) => {
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
      const number = interaction.options.getInteger("numer");
      const rank = interaction.options.getString("ranga") || "Rekrut";
      const corps = getCorps(rank);

      if (!number) {
        return interaction.reply({ content: "❌ Musisz podać numer SW.", ephemeral: true });
      }

      if (db.members[user.id]) {
        return interaction.reply({ content: `❌ ${user} jest już w ewidencji jako **SW-${formatNumber(db.members[user.id].number)}**.`, ephemeral: true });
      }

      if (isNumberTaken(number)) {
        return interaction.reply({ content: `❌ Numer **SW-${formatNumber(number)}** jest już zajęty.`, ephemeral: true });
      }

      const formattedNumber = formatNumber(number);
      db.members[user.id] = {
        userId: user.id,
        number,
        rank,
        corps,
        plus: 0,
        minus: 0,
        reprimands: 0,
        joinedAt: new Date().toISOString(),
      };

      saveData();

      const embed = createEmbed(
        "🟢 PRZYJĘCIE DO SŁUŻBY WIĘZIENNEJ",
        `**Funkcjonariusz:** ${user}\n**Numer:** \`SW-${formattedNumber}\`\n**Korpus:** ${corps}\n**Ranga:** ${rank}\n**Przyjął:** ${interaction.user}`
      );

      await sendLog(interaction.guild, embed);
      return interaction.reply({ embeds: [embed] });
    }

    const user = interaction.options.getUser("osoba");
    const commandsWithMember = ["sw-awans", "sw-degradacja", "sw-wydalenie", "sw-nagana", "sw-plus", "sw-minus", "sw-info"];

    if (commandsWithMember.includes(name) && (!user || !db.members[user.id])) {
      return interaction.reply({ content: "❌ Ta osoba nie znajduje się w ewidencji. Użyj `/sw-dodaj`.", ephemeral: true });
    }

    if (name === "sw-awans") {
      const data = db.members[user.id];
      const oldRank = data.rank;
      const newRank = getNextRank(oldRank);

      if (!newRank) {
        return interaction.reply({ content: "❌ Funkcjonariusz ma już najwyższą rangę.", ephemeral: true });
      }

      data.rank = newRank;
      data.corps = getCorps(newRank);
      saveData();

      const reason = interaction.options.getString("powod") || "Brak podanego powodu.";
      const embed = createEmbed(
        "⬆️ AWANS",
        `**Funkcjonariusz:** ${user} • \`SW-${formatNumber(data.number)}\`\n**Było:** ${oldRank} • ${getCorps(oldRank)}\n**Jest:** ${newRank} • ${data.corps}\n**Powód:** ${reason}\n**Wykonał:** ${interaction.user}`
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
      data.corps = getCorps(newRank);
      saveData();

      const reason = interaction.options.getString("powod") || "Brak podanego powodu.";
      const embed = createEmbed(
        "⬇️ DEGRADACJA",
        `**Funkcjonariusz:** ${user} • \`SW-${formatNumber(data.number)}\`\n**Było:** ${oldRank} • ${getCorps(oldRank)}\n**Jest:** ${newRank} • ${data.corps}\n**Powód:** ${reason}\n**Wykonał:** ${interaction.user}`
      );

      await sendLog(interaction.guild, embed);
      return interaction.reply({ embeds: [embed] });
    }

    if (name === "sw-wydalenie") {
      const data = db.members[user.id];
      const reason = interaction.options.getString("powod");
      const embed = createEmbed(
        "🔴 WYDALENIE",
        `**Funkcjonariusz:** ${user} • \`SW-${formatNumber(data.number)}\`\n**Ranga:** ${data.rank}\n**Korpus:** ${getCorps(data.rank)}\n**Powód:** ${reason}\n**Wykonał:** ${interaction.user}`
      );

      delete db.members[user.id];
      saveData();
      await sendLog(interaction.guild, embed);
      return interaction.reply({ embeds: [embed] });
    }

    if (name === "sw-nagana") {
      const data = db.members[user.id];
      data.reprimands = Number(data.reprimands || 0) + 1;
      saveData();
      const reason = interaction.options.getString("powod");
      const embed = createEmbed(
        "⚠️ NAGANA",
        `**Funkcjonariusz:** ${user} • \`SW-${formatNumber(data.number)}\`\n**Ranga:** ${data.rank}\n**Korpus:** ${getCorps(data.rank)}\n**Nagana nr:** ${data.reprimands}\n**Powód:** ${reason}\n**Wykonał:** ${interaction.user}`
      );
      await sendLog(interaction.guild, embed);
      return interaction.reply({ embeds: [embed] });
    }

    if (name === "sw-plus") {
      const data = db.members[user.id];
      const points = interaction.options.getInteger("punkty") || 1;
      data.plus = Number(data.plus || 0) + points;
      saveData();
      const reason = interaction.options.getString("powod");
      const embed = createEmbed(
        "🟢 PLUS",
        `**Funkcjonariusz:** ${user} • \`SW-${formatNumber(data.number)}\`\n**Ranga:** ${data.rank}\n**Korpus:** ${getCorps(data.rank)}\n**Dodano:** +${points}\n**Suma plusów:** ${data.plus}\n**Powód:** ${reason}\n**Wykonał:** ${interaction.user}`
      );
      await sendLog(interaction.guild, embed);
      return interaction.reply({ embeds: [embed] });
    }

    if (name === "sw-minus") {
      const data = db.members[user.id];
      const points = interaction.options.getInteger("punkty") || 1;
      data.minus = Number(data.minus || 0) + points;
      saveData();
      const reason = interaction.options.getString("powod");
      const embed = createEmbed(
        "🔻 MINUS",
        `**Funkcjonariusz:** ${user} • \`SW-${formatNumber(data.number)}\`\n**Ranga:** ${data.rank}\n**Korpus:** ${getCorps(data.rank)}\n**Dodano:** -${points}\n**Suma minusów:** ${data.minus}\n**Powód:** ${reason}\n**Wykonał:** ${interaction.user}`
      );
      await sendLog(interaction.guild, embed);
      return interaction.reply({ embeds: [embed] });
    }

    if (name === "sw-info") {
      const data = db.members[user.id];
      data.corps = getCorps(data.rank);
      saveData();
      const embed = createEmbed(
        "👤 KARTA FUNKCJONARIUSZA",
        `**Funkcjonariusz:** ${user}\n**Numer:** \`SW-${formatNumber(data.number)}\`\n**Ranga:** ${data.rank}\n**Korpus:** ${data.corps}\n**Plusy:** ${data.plus}\n**Minusy:** ${data.minus}\n**Nagany:** ${data.reprimands}`
      );
      return interaction.reply({ embeds: [embed] });
    }

    if (name === "sw-kadra") {
      const members = Object.values(db.members);
      if (!members.length) {
        return interaction.reply("📋 Ewidencja Służby Więziennej jest pusta.");
      }

      members.sort((a, b) => rankIndex(b.rank) - rankIndex(a.rank));
      const description = members
        .map((data) => `**SW-${formatNumber(data.number)}** • <@${data.userId}> • **${data.rank}** • ${getCorps(data.rank)}`)
        .join("\n");

      const embed = createEmbed("📋 KADRA SŁUŻBY WIĘZIENNEJ", description);
      return interaction.reply({ embeds: [embed] });
    }

    if (name === "sw-usun") {
      if (!hasStaffPermission(interaction)) {
        return interaction.reply({ content: "❌ Potrzebujesz uprawnienia **Zarządzanie serwerem**.", ephemeral: true });
      }

      const data = db.members[user.id];
      delete db.members[user.id];
      saveData();
      return interaction.reply(`✅ Usunięto ${user} (SW-${formatNumber(data.number)}) z ewidencji.`);
    }
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({ content: "❌ Wystąpił błąd podczas wykonywania polecenia.", ephemeral: true });
    }
    return interaction.reply({ content: "❌ Wystąpił błąd podczas wykonywania polecenia.", ephemeral: true });
  }
});

client.login(TOKEN);
