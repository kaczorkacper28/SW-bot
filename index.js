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

// ======================================================
// KONFIGURACJA
// ======================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error(
    "❌ Brakuje TOKEN, CLIENT_ID lub GUILD_ID w Environment Variables."
  );
  process.exit(1);
}

// ======================================================
// BAZA DANYCH
// ======================================================

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "sw-data.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_DATA = {
  settings: {
    logChannelId: null,
  },
  members: {},
};

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(DEFAULT_DATA, null, 2),
        "utf8"
      );

      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }

    const data = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return {
      settings: {
        ...DEFAULT_DATA.settings,
        ...(data.settings || {}),
      },
      members: data.members || {},
    };
  } catch (error) {
    console.error(
      "❌ Błąd odczytu bazy danych:",
      error
    );

    return JSON.parse(
      JSON.stringify(DEFAULT_DATA)
    );
  }
}

let db = loadData();

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error(
      "❌ Błąd zapisu bazy danych:",
      error
    );
  }
}

// ======================================================
// SPRAWDZANIE NUMERU SW
// ======================================================

function isNumberTaken(number) {
  return Object.values(db.members).some(
    (member) =>
      Number(member.number) === Number(number)
  );
}

function formatSWNumber(number) {
  return String(number).padStart(2, "0");
}

// ======================================================
// RANGI SŁUŻBY WIĘZIENNEJ
// ======================================================

const RANKS = [
  "Kandydat",
  "Młodszy Funkcjonariusz",
  "Funkcjonariusz",
  "Starszy Funkcjonariusz",
  "Dowódca Zmiany",
  "Zastępca Naczelnika",
  "Naczelnik",
];

function rankIndex(rank) {
  return RANKS.indexOf(rank);
}

function getNextRank(rank) {
  const index = rankIndex(rank);

  if (
    index >= 0 &&
    index < RANKS.length - 1
  ) {
    return RANKS[index + 1];
  }

  return null;
}

function getPreviousRank(rank) {
  const index = rankIndex(rank);

  if (index > 0) {
    return RANKS[index - 1];
  }

  return null;
}

// ======================================================
// EMBEDY
// ======================================================

function createEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({
      text: "Służba Więzienna • System kadrowy",
    });
}

// ======================================================
// LOGI
// ======================================================

async function sendLog(guild, embed) {
  if (!db.settings.logChannelId) {
    return;
  }

  try {
    const channel = await guild.channels
      .fetch(db.settings.logChannelId)
      .catch(() => null);

    if (!channel || !channel.isTextBased()) {
      return;
    }

    await channel.send({
      embeds: [embed],
    });
  } catch (error) {
    console.error(
      "❌ Nie udało się wysłać logu:",
      error
    );
  }
}

// ======================================================
// UPRAWNIENIA
// ======================================================

function hasStaffPermission(interaction) {
  return interaction.memberPermissions?.has(
    PermissionFlagsBits.ManageGuild
  );
}

// ======================================================
// KOMENDY SLASH
// ======================================================

const commands = [
  // ----------------------------------------------------
  // USTAW LOGI
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-ustaw-logi")
    .setDescription(
      "Ustaw kanał, na którym będą pojawiać się działania kadrowe."
    )
    .addChannelOption((o) =>
      o
        .setName("kanal")
        .setDescription("Kanał logów")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  // ----------------------------------------------------
  // DODAJ FUNKCJONARIUSZA
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-dodaj")
    .setDescription(
      "Dodaj funkcjonariusza do ewidencji Służby Więziennej."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("numer")
        .setDescription("Numer SW, np. 1 = SW-01")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(99999)
    )
    .addStringOption((o) =>
      o
        .setName("ranga")
        .setDescription("Ranga początkowa")
        .setRequired(false)
        .addChoices(
          ...RANKS.map((rank) => ({
            name: rank,
            value: rank,
          }))
        )
    ),

  // ----------------------------------------------------
  // AWANS
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-awans")
    .setDescription(
      "Awansuj funkcjonariusza o jeden stopień."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("powod")
        .setDescription("Powód awansu")
        .setRequired(false)
    ),

  // ----------------------------------------------------
  // DEGRADACJA
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-degradacja")
    .setDescription(
      "Degraduj funkcjonariusza o jeden stopień."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("powod")
        .setDescription("Powód degradacji")
        .setRequired(false)
    ),

  // ----------------------------------------------------
  // WYDALENIE
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-wydalenie")
    .setDescription(
      "Wydal funkcjonariusza ze Służby Więziennej."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("powod")
        .setDescription("Powód wydalenia")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // NAGANA
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-nagana")
    .setDescription(
      "Nadaj funkcjonariuszowi naganę."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("powod")
        .setDescription("Powód nagany")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // PLUS
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-plus")
    .setDescription(
      "Dodaj funkcjonariuszowi punkt dodatni."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("powod")
        .setDescription("Powód")
        .setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("punkty")
        .setDescription("Liczba punktów")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  // ----------------------------------------------------
  // MINUS
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-minus")
    .setDescription(
      "Dodaj funkcjonariuszowi punkt ujemny."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("powod")
        .setDescription("Powód")
        .setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("punkty")
        .setDescription("Liczba punktów")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  // ----------------------------------------------------
  // KADRA
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-kadra")
    .setDescription(
      "Wyświetl listę funkcjonariuszy Służby Więziennej."
    ),

  // ----------------------------------------------------
  // INFO
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-info")
    .setDescription(
      "Wyświetl kartę funkcjonariusza."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // USUŃ
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-usun")
    .setDescription(
      "Usuń funkcjonariusza z ewidencji."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),
].map((command) => command.toJSON());

// ======================================================
// KLIENT DISCORD
// ======================================================

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ======================================================
// REJESTRACJA KOMEND
// ======================================================

async function registerCommands() {
  const rest = new REST({
    version: "10",
  }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      CLIENT_ID,
      GUILD_ID
    ),
    {
      body: commands,
    }
  );

  console.log(
    "✅ Komendy slash zostały zarejestrowane."
  );
}

// ======================================================
// BOT GOTOWY
// ======================================================

client.once("ready", async () => {
  console.log(
    `✅ Zalogowano jako ${client.user.tag}`
  );

  console.log(
    `🏛️ Serwer ID: ${GUILD_ID}`
  );

  try {
    await registerCommands();
  } catch (error) {
    console.error(
      "❌ Nie udało się zarejestrować komend:"
    );

    console.error(error);
  }
});

// ======================================================
// OBSŁUGA KOMEND
// ======================================================

client.on(
  "interactionCreate",
  async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const name = interaction.commandName;

    try {
      // ==================================================
      // USTAW LOGI
      // ==================================================

      if (name === "sw-ustaw-logi") {
        if (!hasStaffPermission(interaction)) {
          return interaction.reply({
            content:
              "❌ Potrzebujesz uprawnienia **Zarządzanie serwerem**.",
            ephemeral: true,
          });
        }

        const channel =
          interaction.options.getChannel("kanal");

        db.settings.logChannelId = channel.id;

        saveData();

        return interaction.reply(
          `✅ Kanał logów ustawiony na ${channel}.`
        );
      }

      // ==================================================
      // DODAJ FUNKCJONARIUSZA
      // ==================================================

      if (name === "sw-dodaj") {
        const user =
          interaction.options.getUser("osoba");

        const number =
          interaction.options.getInteger("numer");

        const rank =
          interaction.options.getString("ranga") ||
          "Kandydat";

        // SPRAWDZENIE, CZY OSOBA JUŻ JEST W EWIDENCJI

        if (db.members[user.id]) {
          return interaction.reply({
            content:
              "❌ Ta osoba jest już w ewidencji.",
            ephemeral: true,
          });
        }

        // SPRAWDZENIE, CZY NUMER JEST ZAJĘTY

        if (isNumberTaken(number)) {
          return interaction.reply({
            content:
              `❌ Numer \`SW-${formatSWNumber(number)}\` jest już zajęty przez innego funkcjonariusza.`,
            ephemeral: true,
          });
        }

        const formattedNumber =
          formatSWNumber(number);

        db.members[user.id] = {
          userId: user.id,
          number: formattedNumber,
          rank,
          plus: 0,
          minus: 0,
          reprimands: 0,
          joinedAt: new Date().toISOString(),
        };

        saveData();

        const embed = createEmbed(
          "🟢 PRZYJĘCIE DO SŁUŻBY WIĘZIENNEJ",
          `**Funkcjonariusz:** ${user}
**Numer:** \`SW-${formattedNumber}\`
**Ranga:** ${rank}
**Przyjął:** ${interaction.user}`
        );

        await sendLog(
          interaction.guild,
          embed
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // POBRANIE OSOBY
      // ==================================================

      const user =
        interaction.options.getUser("osoba");

      // ==================================================
      // SPRAWDZENIE EWIDENCJI
      // ==================================================

      const commandsWithMember = [
        "sw-awans",
        "sw-degradacja",
        "sw-wydalenie",
        "sw-nagana",
        "sw-plus",
        "sw-minus",
        "sw-info",
      ];

      if (
        commandsWithMember.includes(name) &&
        (!user || !db.members[user.id])
      ) {
        return interaction.reply({
          content:
            "❌ Ta osoba nie znajduje się w ewidencji. Użyj `/sw-dodaj`.",
          ephemeral: true,
        });
      }

      // ==================================================
      // AWANS
      // ==================================================

      if (name === "sw-awans") {
        const data = db.members[user.id];

        const oldRank = data.rank;
        const newRank =
          getNextRank(oldRank);

        if (!newRank) {
          return interaction.reply({
            content:
              "❌ Funkcjonariusz ma już najwyższą rangę.",
            ephemeral: true,
          });
        }

        data.rank = newRank;

        saveData();

        const reason =
          interaction.options.getString(
            "powod"
          ) ||
          "Brak podanego powodu.";

        const embed = createEmbed(
          "⬆️ AWANS",
          `**Funkcjonariusz:** ${user} • \`SW-${data.number}\`
**Było:** ${oldRank}
**Jest:** ${newRank}
**Powód:** ${reason}
**Wykonał:** ${interaction.user}`
        );

        await sendLog(
          interaction.guild,
          embed
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // DEGRADACJA
      // ==================================================

      if (name === "sw-degradacja") {
        const data = db.members[user.id];

        const oldRank = data.rank;
        const newRank =
          getPreviousRank(oldRank);

        if (!newRank) {
          return interaction.reply({
            content:
              "❌ Funkcjonariusz ma już najniższą rangę.",
            ephemeral: true,
          });
        }

        data.rank = newRank;

        saveData();

        const reason =
          interaction.options.getString(
            "powod"
          ) ||
          "Brak podanego powodu.";

        const embed = createEmbed(
          "⬇️ DEGRADACJA",
          `**Funkcjonariusz:** ${user} • \`SW-${data.number}\`
**Było:** ${oldRank}
**Jest:** ${newRank}
**Powód:** ${reason}
**Wykonał:** ${interaction.user}`
        );

        await sendLog(
          interaction.guild,
          embed
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // WYDALENIE
      // ==================================================

      if (name === "sw-wydalenie") {
        const data = db.members[user.id];

        const reason =
          interaction.options.getString(
            "powod"
          );

        delete db.members[user.id];

        saveData();

        const embed = createEmbed(
          "🔴 WYDALENIE ZE SŁUŻBY",
          `**Funkcjonariusz:** ${user} • \`SW-${data.number}\`
**Ostatnia ranga:** ${data.rank}
**Powód:** ${reason}
**Wykonał:** ${interaction.user}`
        );

        await sendLog(
          interaction.guild,
          embed
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // NAGANA
      // ==================================================

      if (name === "sw-nagana") {
        const data = db.members[user.id];

        const reason =
          interaction.options.getString(
            "powod"
          );

        data.reprimands += 1;

        saveData();

        const embed = createEmbed(
          "⚠️ NAGANA",
          `**Funkcjonariusz:** ${user} • \`SW-${data.number}\`
**Ranga:** ${data.rank}
**Nagana nr:** ${data.reprimands}
**Powód:** ${reason}
**Nadał:** ${interaction.user}`
        );

        await sendLog(
          interaction.guild,
          embed
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // PLUS
      // ==================================================

      if (name === "sw-plus") {
        const data = db.members[user.id];

        const points =
          interaction.options.getInteger(
            "punkty"
          ) || 1;

        const reason =
          interaction.options.getString(
            "powod"
          );

        data.plus += points;

        saveData();

        const embed = createEmbed(
          "➕ PLUS",
          `**Funkcjonariusz:** ${user} • \`SW-${data.number}\`
**Ranga:** ${data.rank}
**Dodane punkty:** ${points}
**Łącznie plusów:** ${data.plus}
**Powód:** ${reason}
**Nadał:** ${interaction.user}`
        );

        await sendLog(
          interaction.guild,
          embed
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // MINUS
      // ==================================================

      if (name === "sw-minus") {
        const data = db.members[user.id];

        const points =
          interaction.options.getInteger(
            "punkty"
          ) || 1;

        const reason =
          interaction.options.getString(
            "powod"
          );

        data.minus += points;

        saveData();

        const embed = createEmbed(
          "➖ MINUS",
          `**Funkcjonariusz:** ${user} • \`SW-${data.number}\`
**Ranga:** ${data.rank}
**Dodane punkty:** ${points}
**Łącznie minusów:** ${data.minus}
**Powód:** ${reason}
**Nadał:** ${interaction.user}`
        );

        await sendLog(
          interaction.guild,
          embed
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // INFO
      // ==================================================

      if (name === "sw-info") {
        const data = db.members[user.id];

        const joinedTimestamp =
          Math.floor(
            new Date(data.joinedAt).getTime() /
              1000
          );

        const embed = createEmbed(
          `📋 KARTA FUNKCJONARIUSZA — SW-${data.number}`,
          `**Osoba:** ${user}
**Numer:** \`SW-${data.number}\`
**Ranga:** ${data.rank}

**➕ Plusy:** ${data.plus}
**➖ Minusy:** ${data.minus}
**⚠️ Nagany:** ${data.reprimands}

**Data przyjęcia:** <t:${joinedTimestamp}:d>`
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // KADRA
      // ==================================================

      if (name === "sw-kadra") {
        const list = Object.values(
          db.members
        ).sort(
          (a, b) =>
            Number(a.number) -
            Number(b.number)
        );

        if (!list.length) {
          return interaction.reply(
            "📋 Ewidencja jest obecnie pusta."
          );
        }

        const lines = list.map(
          (member) =>
            `**SW-${member.number}** — <@${member.userId}> — **${member.rank}** | ➕ ${member.plus} | ➖ ${member.minus} | ⚠️ ${member.reprimands}`
        );

        const embed = createEmbed(
          "🛡️ KADRA SŁUŻBY WIĘZIENNEJ",
          lines
            .join("\n")
            .slice(0, 3900)
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // USUŃ
      // ==================================================

      if (name === "sw-usun") {
        if (!hasStaffPermission(interaction)) {
          return interaction.reply({
            content:
              "❌ Potrzebujesz uprawnienia **Zarządzanie serwerem**.",
            ephemeral: true,
          });
        }

        if (!db.members[user.id]) {
          return interaction.reply({
            content:
              "❌ Tej osoby nie ma w ewidencji.",
            ephemeral: true,
          });
        }

        const data = db.members[user.id];

        delete db.members[user.id];

        saveData();
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

// ======================================================
// KONFIGURACJA
// ======================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error(
    "❌ Brakuje TOKEN, CLIENT_ID lub GUILD_ID w Environment Variables."
  );
  process.exit(1);
}

// ======================================================
// BAZA DANYCH
// ======================================================

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "sw-data.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_DATA = {
  settings: {
    logChannelId: null,
  },
  members: {},
};

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(DEFAULT_DATA, null, 2),
        "utf8"
      );

      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }

    const data = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return {
      settings: {
        ...DEFAULT_DATA.settings,
        ...(data.settings || {}),
      },
      members: data.members || {},
    };
  } catch (error) {
    console.error(
      "❌ Błąd odczytu bazy danych:",
      error
    );

    return JSON.parse(
      JSON.stringify(DEFAULT_DATA)
    );
  }
}

let db = loadData();

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error(
      "❌ Błąd zapisu bazy danych:",
      error
    );
  }
}

// ======================================================
// SPRAWDZANIE NUMERU SW
// ======================================================

function isNumberTaken(number) {
  return Object.values(db.members).some(
    (member) =>
      Number(member.number) === Number(number)
  );
}

function formatSWNumber(number) {
  return String(number).padStart(2, "0");
}

// ======================================================
// RANGI SŁUŻBY WIĘZIENNEJ
// ======================================================

const RANKS = [
  "Kandydat",
  "Młodszy Funkcjonariusz",
  "Funkcjonariusz",
  "Starszy Funkcjonariusz",
  "Dowódca Zmiany",
  "Zastępca Naczelnika",
  "Naczelnik",
];

function rankIndex(rank) {
  return RANKS.indexOf(rank);
}

function getNextRank(rank) {
  const index = rankIndex(rank);

  if (
    index >= 0 &&
    index < RANKS.length - 1
  ) {
    return RANKS[index + 1];
  }

  return null;
}

function getPreviousRank(rank) {
  const index = rankIndex(rank);

  if (index > 0) {
    return RANKS[index - 1];
  }

  return null;
}

// ======================================================
// EMBEDY
// ======================================================

function createEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({
      text: "Służba Więzienna • System kadrowy",
    });
}

// ======================================================
// LOGI
// ======================================================

async function sendLog(guild, embed) {
  if (!db.settings.logChannelId) {
    return;
  }

  try {
    const channel = await guild.channels
      .fetch(db.settings.logChannelId)
      .catch(() => null);

    if (!channel || !channel.isTextBased()) {
      return;
    }

    await channel.send({
      embeds: [embed],
    });
  } catch (error) {
    console.error(
      "❌ Nie udało się wysłać logu:",
      error
    );
  }
}

// ======================================================
// UPRAWNIENIA
// ======================================================

function hasStaffPermission(interaction) {
  return interaction.memberPermissions?.has(
    PermissionFlagsBits.ManageGuild
  );
}

// ======================================================
// KOMENDY SLASH
// ======================================================

const commands = [
  // ----------------------------------------------------
  // USTAW LOGI
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-ustaw-logi")
    .setDescription(
      "Ustaw kanał, na którym będą pojawiać się działania kadrowe."
    )
    .addChannelOption((o) =>
      o
        .setName("kanal")
        .setDescription("Kanał logów")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  // ----------------------------------------------------
  // DODAJ FUNKCJONARIUSZA
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-dodaj")
    .setDescription(
      "Dodaj funkcjonariusza do ewidencji Służby Więziennej."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("numer")
        .setDescription("Numer SW, np. 1 = SW-01")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(99999)
    )
    .addStringOption((o) =>
      o
        .setName("ranga")
        .setDescription("Ranga początkowa")
        .setRequired(false)
        .addChoices(
          ...RANKS.map((rank) => ({
            name: rank,
            value: rank,
          }))
        )
    ),

  // ----------------------------------------------------
  // AWANS
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-awans")
    .setDescription(
      "Awansuj funkcjonariusza o jeden stopień."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("powod")
        .setDescription("Powód awansu")
        .setRequired(false)
    ),

  // ----------------------------------------------------
  // DEGRADACJA
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-degradacja")
    .setDescription(
      "Degraduj funkcjonariusza o jeden stopień."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("powod")
        .setDescription("Powód degradacji")
        .setRequired(false)
    ),

  // ----------------------------------------------------
  // WYDALENIE
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-wydalenie")
    .setDescription(
      "Wydal funkcjonariusza ze Służby Więziennej."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("powod")
        .setDescription("Powód wydalenia")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // NAGANA
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-nagana")
    .setDescription(
      "Nadaj funkcjonariuszowi naganę."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("powod")
        .setDescription("Powód nagany")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // PLUS
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-plus")
    .setDescription(
      "Dodaj funkcjonariuszowi punkt dodatni."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("powod")
        .setDescription("Powód")
        .setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("punkty")
        .setDescription("Liczba punktów")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  // ----------------------------------------------------
  // MINUS
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-minus")
    .setDescription(
      "Dodaj funkcjonariuszowi punkt ujemny."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("powod")
        .setDescription("Powód")
        .setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("punkty")
        .setDescription("Liczba punktów")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  // ----------------------------------------------------
  // KADRA
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-kadra")
    .setDescription(
      "Wyświetl listę funkcjonariuszy Służby Więziennej."
    ),

  // ----------------------------------------------------
  // INFO
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-info")
    .setDescription(
      "Wyświetl kartę funkcjonariusza."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    ),

  // ----------------------------------------------------
  // USUŃ
  // ----------------------------------------------------

  new SlashCommandBuilder()
    .setName("sw-usun")
    .setDescription(
      "Usuń funkcjonariusza z ewidencji."
    )
    .addUserOption((o) =>
      o
        .setName("osoba")
        .setDescription("Funkcjonariusz")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),
].map((command) => command.toJSON());

// ======================================================
// KLIENT DISCORD
// ======================================================

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ======================================================
// REJESTRACJA KOMEND
// ======================================================

async function registerCommands() {
  const rest = new REST({
    version: "10",
  }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      CLIENT_ID,
      GUILD_ID
    ),
    {
      body: commands,
    }
  );

  console.log(
    "✅ Komendy slash zostały zarejestrowane."
  );
}

// ======================================================
// BOT GOTOWY
// ======================================================

client.once("ready", async () => {
  console.log(
    `✅ Zalogowano jako ${client.user.tag}`
  );

  console.log(
    `🏛️ Serwer ID: ${GUILD_ID}`
  );

  try {
    await registerCommands();
  } catch (error) {
    console.error(
      "❌ Nie udało się zarejestrować komend:"
    );

    console.error(error);
  }
});

// ======================================================
// OBSŁUGA KOMEND
// ======================================================

client.on(
  "interactionCreate",
  async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const name = interaction.commandName;

    try {
      // ==================================================
      // USTAW LOGI
      // ==================================================

      if (name === "sw-ustaw-logi") {
        if (!hasStaffPermission(interaction)) {
          return interaction.reply({
            content:
              "❌ Potrzebujesz uprawnienia **Zarządzanie serwerem**.",
            ephemeral: true,
          });
        }

        const channel =
          interaction.options.getChannel("kanal");

        db.settings.logChannelId = channel.id;

        saveData();

        return interaction.reply(
          `✅ Kanał logów ustawiony na ${channel}.`
        );
      }

      // ==================================================
      // DODAJ FUNKCJONARIUSZA
      // ==================================================

      if (name === "sw-dodaj") {
        const user =
          interaction.options.getUser("osoba");

        const number =
          interaction.options.getInteger("numer");

        const rank =
          interaction.options.getString("ranga") ||
          "Kandydat";

        // SPRAWDZENIE, CZY OSOBA JUŻ JEST W EWIDENCJI

        if (db.members[user.id]) {
          return interaction.reply({
            content:
              "❌ Ta osoba jest już w ewidencji.",
            ephemeral: true,
          });
        }

        // SPRAWDZENIE, CZY NUMER JEST ZAJĘTY

        if (isNumberTaken(number)) {
          return interaction.reply({
            content:
              `❌ Numer \`SW-${formatSWNumber(number)}\` jest już zajęty przez innego funkcjonariusza.`,
            ephemeral: true,
          });
        }

        const formattedNumber =
          formatSWNumber(number);

        db.members[user.id] = {
          userId: user.id,
          number: formattedNumber,
          rank,
          plus: 0,
          minus: 0,
          reprimands: 0,
          joinedAt: new Date().toISOString(),
        };

        saveData();

        const embed = createEmbed(
          "🟢 PRZYJĘCIE DO SŁUŻBY WIĘZIENNEJ",
          `**Funkcjonariusz:** ${user}
**Numer:** \`SW-${formattedNumber}\`
**Ranga:** ${rank}
**Przyjął:** ${interaction.user}`
        );

        await sendLog(
          interaction.guild,
          embed
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // POBRANIE OSOBY
      // ==================================================

      const user =
        interaction.options.getUser("osoba");

      // ==================================================
      // SPRAWDZENIE EWIDENCJI
      // ==================================================

      const commandsWithMember = [
        "sw-awans",
        "sw-degradacja",
        "sw-wydalenie",
        "sw-nagana",
        "sw-plus",
        "sw-minus",
        "sw-info",
      ];

      if (
        commandsWithMember.includes(name) &&
        (!user || !db.members[user.id])
      ) {
        return interaction.reply({
          content:
            "❌ Ta osoba nie znajduje się w ewidencji. Użyj `/sw-dodaj`.",
          ephemeral: true,
        });
      }

      // ==================================================
      // AWANS
      // ==================================================

      if (name === "sw-awans") {
        const data = db.members[user.id];

        const oldRank = data.rank;
        const newRank =
          getNextRank(oldRank);

        if (!newRank) {
          return interaction.reply({
            content:
              "❌ Funkcjonariusz ma już najwyższą rangę.",
            ephemeral: true,
          });
        }

        data.rank = newRank;

        saveData();

        const reason =
          interaction.options.getString(
            "powod"
          ) ||
          "Brak podanego powodu.";

        const embed = createEmbed(
          "⬆️ AWANS",
          `**Funkcjonariusz:** ${user} • \`SW-${data.number}\`
**Było:** ${oldRank}
**Jest:** ${newRank}
**Powód:** ${reason}
**Wykonał:** ${interaction.user}`
        );

        await sendLog(
          interaction.guild,
          embed
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // DEGRADACJA
      // ==================================================

      if (name === "sw-degradacja") {
        const data = db.members[user.id];

        const oldRank = data.rank;
        const newRank =
          getPreviousRank(oldRank);

        if (!newRank) {
          return interaction.reply({
            content:
              "❌ Funkcjonariusz ma już najniższą rangę.",
            ephemeral: true,
          });
        }

        data.rank = newRank;

        saveData();

        const reason =
          interaction.options.getString(
            "powod"
          ) ||
          "Brak podanego powodu.";

        const embed = createEmbed(
          "⬇️ DEGRADACJA",
          `**Funkcjonariusz:** ${user} • \`SW-${data.number}\`
**Było:** ${oldRank}
**Jest:** ${newRank}
**Powód:** ${reason}
**Wykonał:** ${interaction.user}`
        );

        await sendLog(
          interaction.guild,
          embed
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // WYDALENIE
      // ==================================================

      if (name === "sw-wydalenie") {
        const data = db.members[user.id];

        const reason =
          interaction.options.getString(
            "powod"
          );

        delete db.members[user.id];

        saveData();

        const embed = createEmbed(
          "🔴 WYDALENIE ZE SŁUŻBY",
          `**Funkcjonariusz:** ${user} • \`SW-${data.number}\`
**Ostatnia ranga:** ${data.rank}
**Powód:** ${reason}
**Wykonał:** ${interaction.user}`
        );

        await sendLog(
          interaction.guild,
          embed
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // NAGANA
      // ==================================================

      if (name === "sw-nagana") {
        const data = db.members[user.id];

        const reason =
          interaction.options.getString(
            "powod"
          );

        data.reprimands += 1;

        saveData();

        const embed = createEmbed(
          "⚠️ NAGANA",
          `**Funkcjonariusz:** ${user} • \`SW-${data.number}\`
**Ranga:** ${data.rank}
**Nagana nr:** ${data.reprimands}
**Powód:** ${reason}
**Nadał:** ${interaction.user}`
        );

        await sendLog(
          interaction.guild,
          embed
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // PLUS
      // ==================================================

      if (name === "sw-plus") {
        const data = db.members[user.id];

        const points =
          interaction.options.getInteger(
            "punkty"
          ) || 1;

        const reason =
          interaction.options.getString(
            "powod"
          );

        data.plus += points;

        saveData();

        const embed = createEmbed(
          "➕ PLUS",
          `**Funkcjonariusz:** ${user} • \`SW-${data.number}\`
**Ranga:** ${data.rank}
**Dodane punkty:** ${points}
**Łącznie plusów:** ${data.plus}
**Powód:** ${reason}
**Nadał:** ${interaction.user}`
        );

        await sendLog(
          interaction.guild,
          embed
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // MINUS
      // ==================================================

      if (name === "sw-minus") {
        const data = db.members[user.id];

        const points =
          interaction.options.getInteger(
            "punkty"
          ) || 1;

        const reason =
          interaction.options.getString(
            "powod"
          );

        data.minus += points;

        saveData();

        const embed = createEmbed(
          "➖ MINUS",
          `**Funkcjonariusz:** ${user} • \`SW-${data.number}\`
**Ranga:** ${data.rank}
**Dodane punkty:** ${points}
**Łącznie minusów:** ${data.minus}
**Powód:** ${reason}
**Nadał:** ${interaction.user}`
        );

        await sendLog(
          interaction.guild,
          embed
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // INFO
      // ==================================================

      if (name === "sw-info") {
        const data = db.members[user.id];

        const joinedTimestamp =
          Math.floor(
            new Date(data.joinedAt).getTime() /
              1000
          );

        const embed = createEmbed(
          `📋 KARTA FUNKCJONARIUSZA — SW-${data.number}`,
          `**Osoba:** ${user}
**Numer:** \`SW-${data.number}\`
**Ranga:** ${data.rank}

**➕ Plusy:** ${data.plus}
**➖ Minusy:** ${data.minus}
**⚠️ Nagany:** ${data.reprimands}

**Data przyjęcia:** <t:${joinedTimestamp}:d>`
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // KADRA
      // ==================================================

      if (name === "sw-kadra") {
        const list = Object.values(
          db.members
        ).sort(
          (a, b) =>
            Number(a.number) -
            Number(b.number)
        );

        if (!list.length) {
          return interaction.reply(
            "📋 Ewidencja jest obecnie pusta."
          );
        }

        const lines = list.map(
          (member) =>
            `**SW-${member.number}** — <@${member.userId}> — **${member.rank}** | ➕ ${member.plus} | ➖ ${member.minus} | ⚠️ ${member.reprimands}`
        );

        const embed = createEmbed(
          "🛡️ KADRA SŁUŻBY WIĘZIENNEJ",
          lines
            .join("\n")
            .slice(0, 3900)
        );

        return interaction.reply({
          embeds: [embed],
        });
      }

      // ==================================================
      // USUŃ
      // ==================================================

      if (name === "sw-usun") {
        if (!hasStaffPermission(interaction)) {
          return interaction.reply({
            content:
              "❌ Potrzebujesz uprawnienia **Zarządzanie serwerem**.",
            ephemeral: true,
          });
        }

        if (!db.members[user.id]) {
          return interaction.reply({
            content:
              "❌ Tej osoby nie ma w ewidencji.",
            ephemeral: true,
          });
        }

        const data = db.members[user.id];

        delete db.members[user.id];

        saveData();

        return interaction.reply(
          `🗑️ Usunięto ${user} (\`SW-${data.number}\`) z ewidencji.`
        );
      }

    } catch (error) {
      console.error(
        "❌ Błąd podczas wykonywania komendy:"
      );

      console.error(error);

      if (
        interaction.replied ||
        interaction.deferred
      ) {
        await interaction
          .followUp({
            content:
              "❌ Wystąpił błąd podczas wykonywania komendy.",
            ephemeral: true,
          })
          .catch(() => {});
      } else {
        await interaction
          .reply({
            content:
              "❌ Wystąpił błąd podczas wykonywania komendy.",
            ephemeral: true,
          })
          .catch(() => {});
      }
    }
  }
);

// ======================================================
// LOGOWANIE BOTA
// ======================================================

client.login(TOKEN);
        return interaction.reply(
          `🗑️ Usunięto ${user} (\`SW-${data.number}\`) z ewidencji.`
        );
      }

    } catch (error) {
      console.error(
        "❌ Błąd podczas wykonywania komendy:"
      );

      console.error(error);

      if (
        interaction.replied ||
        interaction.deferred
      ) {
        await interaction
          .followUp({
            content:
              "❌ Wystąpił błąd podczas wykonywania komendy.",
            ephemeral: true,
          })
          .catch(() => {});
      } else {
        await interaction
          .reply({
            content:
              "❌ Wystąpił błąd podczas wykonywania komendy.",
            ephemeral: true,
          })
          .catch(() => {});
      }
    }
  }
);

// ======================================================
// LOGOWANIE BOTA
// ======================================================

client.login(TOKEN);
