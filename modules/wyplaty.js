const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("sw-wyplata")
    .setDescription("Wypłać środki funkcjonariuszowi SW przez UnbelievaBoat.")
    .addUserOption(o => o.setName("osoba").setDescription("Odbiorca").setRequired(true))
    .addIntegerOption(o => o.setName("kwota").setDescription("Kwota w zł").setRequired(true).setMinValue(1).setMaxValue(1000000000))
    .addStringOption(o => o.setName("powod").setDescription("Powód wypłaty").setMaxLength(500))
    .toJSON()
];

function registerWyplatyModule(client) {
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "sw-wyplata") return;

    const swGuildId = process.env.SW_GUILD_ID || process.env.GUILD_ID;
    if (interaction.guildId !== swGuildId) {
      return interaction.reply({ content: "❌ Wypłaty można wykonać tylko na serwerze SW.", ephemeral: true });
    }

    const payoutRoleId = process.env.PAYOUT_ROLE_ID;
    const roles = interaction.member?.roles;
    const hasPayoutRole = Boolean(payoutRoleId) &&
      (roles?.cache?.has(payoutRoleId) || (Array.isArray(roles) && roles.includes(payoutRoleId)));
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    if (!hasPayoutRole && !isAdmin) {
      return interaction.reply({ content: "❌ Brak uprawnień do wykonywania wypłat.", ephemeral: true });
    }

    const mainGuildId = process.env.MAIN_GUILD_ID;
    const apiToken = process.env.UNB_API_TOKEN;
    if (!mainGuildId || !apiToken) {
      return interaction.reply({ content: "❌ Brakuje konfiguracji MAIN_GUILD_ID lub UNB_API_TOKEN.", ephemeral: true });
    }

    const target = interaction.options.getUser("osoba", true);
    const amount = interaction.options.getInteger("kwota", true);
    const reason = interaction.options.getString("powod") || "Wypłata służbowa SW";
    if (target.bot || !Number.isSafeInteger(amount) || amount <= 0) {
      return interaction.reply({ content: "❌ Nieprawidłowy odbiorca lub kwota.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const endpoint = "https://unbelievaboat.com/api/v1/guilds/" +
      encodeURIComponent(mainGuildId) + "/users/" + encodeURIComponent(target.id);

    let confirmedByApi = false;
    try {
      // PATCH zwiększa saldo o podaną kwotę; nie zastępuje całego salda.
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { Authorization: apiToken, "Content-Type": "application/json" },
        body: JSON.stringify({ cash: amount, reason: reason + " | SW: " + interaction.user.id }),
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        const messages = {
          401: "Token API UnbelievaBoat jest nieprawidłowy.",
          403: "Brak uprawnień API do wypłat.",
          404: "Nie znaleziono konta użytkownika lub serwera ekonomii.",
          429: "Limit zapytań UnbelievaBoat. Spróbuj później."
        };
        const failure = new Error(messages[response.status] || "API zwróciło kod " + response.status);
        failure.httpStatus = response.status;
        throw failure;
      }

      confirmedByApi = true;
      const result = await response.json().catch(() => ({}));
      const embed = new EmbedBuilder()
        .setTitle("💰 Wypłata służbowa SW")
        .addFields(
          { name: "Funkcjonariusz", value: target.toString(), inline: true },
          { name: "Kwota", value: amount.toLocaleString("pl-PL") + " zł", inline: true },
          { name: "Wypłacił", value: interaction.user.toString(), inline: true },
          { name: "Powód", value: reason },
          { name: "Saldo po", value: typeof result.total === "number" ? result.total.toLocaleString("pl-PL") + " zł" : "Brak danych" }
        )
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });

      if (process.env.LOG_CHANNEL_ID) {
        try {
          const channel = await client.channels.fetch(process.env.LOG_CHANNEL_ID);
          if (channel?.isTextBased()) await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
        } catch (error) {
          console.error("Nie udało się wysłać logu wypłaty:", error);
        }
      }
    } catch (error) {
      console.error("Błąd wypłaty SW:", error.message);
      const detail = confirmedByApi
        ? "API potwierdziło wypłatę, ale potwierdzenie Discord nie powiodło się. Sprawdź saldo przed ponowną próbą."
        : error.httpStatus ? error.message
        : "Nie udało się potwierdzić operacji. Sprawdź saldo przed ponowną próbą, aby uniknąć podwójnej wypłaty.";
      await interaction.editReply({ content: "❌ " + detail }).catch(() => {});
    }
  });
  return commands;
}

module.exports = { registerWyplatyModule };
