const fs = require("fs");
const path = require("path");
const {
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
  Colors
} = require("discord.js");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "sw-stopnie.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const defaultData = {
  channelId: null,
  messageId: null,
  title: "🛡️ SŁUŻBA WIĘZIENNA",
  description: "Lista funkcjonariuszy Służby Więziennej.",
  sections: {
    szefostwo: [],
    pracownicy: [],
    rekruci: []
  }
};

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    return structuredClone(defaultData);
  }

  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      ...structuredClone(defaultData),
      ...data,
      sections: {
        ...structuredClone(defaultData.sections),
        ...(data.sections || {})
      }
    };
  } catch {
    console.error("Nie można odczytać data/sw-data.json. Tworzę nowy plik.");
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    return structuredClone(defaultData);
  }
}

let data = loadData();

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const SECTION_NAMES = {
  szefostwo: "👑 SZEFOSTWO",
  pracownicy: "👮 PRACOWNICY SW",
  rekruci: "📋 REKRUTACJA"
};

const SECTION_PREFIX = {
  szefostwo: "SW",
  pracownicy: "SW",
  rekruci: "SWRO"
};

function sectionLabel(section) {
  return SECTION_NAMES[section] || section;
}

function nextNumber(section) {
  const members = data.sections[section] || [];
  if (members.length === 0) return 1;

  const numbers = members
    .map(x => Number(x.number))
    .filter(Number.isFinite);

  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

function formatNumber(section, number) {
  if (section === "rekruci") return `SWRO${String(number).padStart(2, "0")}`;
  return `SW-${String(number).padStart(2, "0")}`;
}

function buildList(section) {
  const members = data.sections[section] || [];

  if (!members.length) return "Brak osób.";

  return members
    .sort((a, b) => a.number - b.number)
    .map(m => `${formatNumber(section, m.number)}: <@${m.userId}>`)
    .join("\n");
}

function buildEmbed() {
  const embed = new EmbedBuilder()
    .setTitle(data.title)
    .setDescription(data.description)
    .setColor(Colors.DarkGold)
    .setTimestamp();

  embed.addFields(
    {
      name: SECTION_NAMES.szefostwo,
      value: buildList("szefostwo"),
      inline: false
    },
    {
      name: SECTION_NAMES.pracownicy,
      value: buildList("pracownicy"),
      inline: false
    },
    {
      name: SECTION_NAMES.rekruci,
      value: buildList("rekruci"),
      inline: false
    }
  );

  return embed;
}

async function updateMessage(client) {
  if (!data.channelId) return;

  const channel = await client.channels.fetch(data.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  let message = null;

  if (data.messageId) {
    message = await channel.messages.fetch(data.messageId).catch(() => null);
  }

  if (!message) {
    message = await channel.send({ embeds: [buildEmbed()] });
    data.messageId = message.id;
    saveData();
    return;
  }

  await message.edit({ embeds: [buildEmbed()] });
}

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

const commands = [
  new SlashCommandBuilder()
    .setName("stopnie-ustaw-kanal")
    .setDescription("Ustawia kanał, na którym bot będzie prowadził listę SW.")
    .addChannelOption(option =>
      option
        .setName("kanal")
        .setDescription("Kanał tekstowy na listę SW.")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("stopnie-dodaj")
    .setDescription("Dodaje osobę do listy Służby Więziennej.")
    .addUserOption(option =>
      option.setName("osoba").setDescription("Osoba do dodania.").setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("dzial")
        .setDescription("Dział SW.")
        .setRequired(true)
        .addChoices(
          { name: "Szefostwo", value: "szefostwo" },
          { name: "Pracownicy SW", value: "pracownicy" },
          { name: "Rekruci", value: "rekruci" }
        )
    )
    .addIntegerOption(option =>
      option
        .setName("numer")
        .setDescription("Opcjonalny numer SW. Jeśli pusty, bot nada kolejny.")
        .setMinValue(1)
        .setMaxValue(999)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("stopnie-usun")
    .setDescription("Usuwa osobę z listy SW.")
    .addUserOption(option =>
      option.setName("osoba").setDescription("Osoba do usunięcia.").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("stopnie-przenies")
    .setDescription("Przenosi osobę do innego działu.")
    .addUserOption(option =>
      option.setName("osoba").setDescription("Osoba do przeniesienia.").setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("dzial")
        .setDescription("Nowy dział.")
        .setRequired(true)
        .addChoices(
          { name: "Szefostwo", value: "szefostwo" },
          { name: "Pracownicy SW", value: "pracownicy" },
          { name: "Rekruci", value: "rekruci" }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("stopnie-lista")
    .setDescription("Pokazuje aktualną listę SW.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("stopnie-reset")
    .setDescription("Usuwa całą listę SW.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("stopnie-tytul")
    .setDescription("Zmienia tytuł i opis listy SW.")
    .addStringOption(option =>
      option.setName("tytul").setDescription("Nowy tytuł.").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("opis").setDescription("Nowy opis.").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(command => command.toJSON());

function registerStopnieModule(client) {
  client.once('ready', () => { updateMessage(client).catch(console.error); });
  const stopnieNames = new Set(commands.map(command => command.name));

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || !stopnieNames.has(interaction.commandName)) return;

  if (!isAdmin(interaction)) {
    return interaction.reply({
      content: "❌ Nie masz uprawnień administratora do używania tej komendy.",
      ephemeral: true
    });
  }

  try {
    if (interaction.commandName === "stopnie-ustaw-kanal") {
      const channel = interaction.options.getChannel("kanal");

      if (!channel.isTextBased()) {
        return interaction.reply({
          content: "❌ Wybierz kanał tekstowy.",
          ephemeral: true
        });
      }

      data.channelId = channel.id;
      data.messageId = null;
      saveData();

      await updateMessage(client);

      return interaction.reply({
        content: `✅ Ustawiono kanał listy SW: <#${channel.id}>`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "stopnie-dodaj") {
      const user = interaction.options.getUser("osoba");
      const section = interaction.options.getString("dzial");
      const customNumber = interaction.options.getInteger("numer");

      // Usuń osobę z poprzedniego działu, aby nie pojawiła się dwa razy.
      for (const key of Object.keys(data.sections)) {
        data.sections[key] = data.sections[key].filter(m => m.userId !== user.id);
      }

      const number = customNumber || nextNumber(section);

      const duplicateNumber = data.sections[section].some(
        m => m.number === number
      );

      if (duplicateNumber) {
        return interaction.reply({
          content: `❌ Numer ${formatNumber(section, number)} jest już zajęty.`,
          ephemeral: true
        });
      }

      data.sections[section].push({
        userId: user.id,
        number
      });

      saveData();
      await updateMessage(client);

      return interaction.reply({
        content: `✅ Dodano ${user} jako **${formatNumber(section, number)}** do **${sectionLabel(section)}**.`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "stopnie-usun") {
      const user = interaction.options.getUser("osoba");
      let removed = false;

      for (const key of Object.keys(data.sections)) {
        const oldLength = data.sections[key].length;
        data.sections[key] = data.sections[key].filter(m => m.userId !== user.id);
        if (data.sections[key].length !== oldLength) removed = true;
      }

      if (!removed) {
        return interaction.reply({
          content: "❌ Tej osoby nie ma na liście.",
          ephemeral: true
        });
      }

      saveData();
      await updateMessage(client);

      return interaction.reply({
        content: `✅ Usunięto ${user} z listy SW.`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "stopnie-przenies") {
      const user = interaction.options.getUser("osoba");
      const newSection = interaction.options.getString("dzial");

      let oldMember = null;

      for (const key of Object.keys(data.sections)) {
        const found = data.sections[key].find(m => m.userId === user.id);
        if (found) {
          oldMember = { ...found, oldSection: key };
          data.sections[key] = data.sections[key].filter(m => m.userId !== user.id);
        }
      }

      if (!oldMember) {
        return interaction.reply({
          content: "❌ Tej osoby nie ma na liście. Użyj `/stopnie-dodaj`.",
          ephemeral: true
        });
      }

      const number = nextNumber(newSection);

      data.sections[newSection].push({
        userId: user.id,
        number
      });

      saveData();
      await updateMessage(client);

      return interaction.reply({
        content: `✅ Przeniesiono ${user} z **${sectionLabel(oldMember.oldSection)}** do **${sectionLabel(newSection)}** jako **${formatNumber(newSection, number)}**.`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "stopnie-lista") {
      return interaction.reply({
        embeds: [buildEmbed()],
        ephemeral: true
      });
    }

    if (interaction.commandName === "stopnie-reset") {
      data.sections = {
        szefostwo: [],
        pracownicy: [],
        rekruci: []
      };

      saveData();
      await updateMessage(client);

      return interaction.reply({
        content: "⚠️ Cała lista SW została wyczyszczona.",
        ephemeral: true
      });
    }

    if (interaction.commandName === "stopnie-tytul") {
      data.title = interaction.options.getString("tytul");
      const opis = interaction.options.getString("opis");
      if (opis) data.description = opis;

      saveData();
      await updateMessage(client);

      return interaction.reply({
        content: "✅ Zmieniono wygląd nagłówka listy SW.",
        ephemeral: true
      });
    }
  } catch (error) {
    console.error(error);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "❌ Wystąpił błąd podczas wykonywania komendy.",
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: "❌ Wystąpił błąd podczas wykonywania komendy.",
        ephemeral: true
      });
    }
  }
});

return commands;
}

module.exports = { registerStopnieModule };
