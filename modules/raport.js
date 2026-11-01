const {
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require("discord.js");



// ======================================================
// KONFIGURACJA
// ======================================================

const REPORT_CHANNEL_ID = process.env.REPORT_CHANNEL_ID;
const commands = [{ name: 'raport-panel', description: 'Wyświetla panel składania raportów służbowych' }];

// ======================================================
// PANEL RAPORTÓW
// ======================================================

function createReportPanel() {

    const embed = new EmbedBuilder()
        .setColor(0x19a85b)
        .setTitle("📋 RAPORTY SŁUŻBOWE")
        .setDescription(
            "Chcesz złożyć raport ze swojej służby?\n\n" +

            "Kliknij przycisk **📝 Złóż raport** " +
            "i wypełnij formularz.\n\n" +

            "━━━━━━━━━━━━━━━━━━━━\n\n" +

            "📌 **Pamiętaj:**\n" +
            "• Podawaj prawdziwe informacje.\n" +
            "• Dokładnie opisz przebieg służby.\n" +
            "• Wpisz prawidłową datę oraz godziny służby.\n" +
            "• W przypadku interwencji dokładnie ją opisz.\n\n" +

            "🔒 Po wysłaniu raport zostanie automatycznie " +
            "przekazany do kanału **📜・raporty-służbowe**."
        )
        .setFooter({
            text: "Służba Więzienna • System Raportów"
        })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(

            new ButtonBuilder()
                .setCustomId("zloz_raport")
                .setLabel("Złóż raport")
                .setEmoji("📝")
                .setStyle(ButtonStyle.Success)

        );

    return {
        embeds: [embed],
        components: [row]
    };
}

// ======================================================
// INTERAKCJE
// ======================================================

function registerRaportModule(client) {
client.on("interactionCreate", async interaction => {

    // ==================================================
    // /raport-panel
    // ==================================================

    if (interaction.isChatInputCommand()) {

        if (interaction.commandName !== "raport-panel") {
            return;
        }

        // Tylko osoby z Zarządzaniem serwerem
        if (
            !interaction.memberPermissions.has(
                PermissionFlagsBits.ManageGuild
            )
        ) {

            return interaction.reply({
                content:
                    "❌ Nie masz uprawnień do wysłania panelu raportów.",
                ephemeral: true
            });

        }

        await interaction.channel.send(
            createReportPanel()
        );

        return interaction.reply({
            content:
                "✅ Panel raportów został wysłany.",
            ephemeral: true
        });
    }

    // ==================================================
    // PRZYCISK „ZŁÓŻ RAPORT”
    // ==================================================

    if (
        interaction.isButton() &&
        interaction.customId === "zloz_raport"
    ) {

        const modal = new ModalBuilder()
            .setCustomId("formularz_raportu")
            .setTitle("📋 Raport służbowy");

        // DATA
        const dataSluzby = new TextInputBuilder()
            .setCustomId("data_sluzby")
            .setLabel("📅 Data służby")
            .setPlaceholder("np. 21.08.2026")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(20);

        // GODZINY
        const godziny = new TextInputBuilder()
            .setCustomId("godziny")
            .setLabel("⏰ Godziny służby")
            .setPlaceholder("np. 18:00 - 22:00")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(30);

        // MIEJSCE
        const miejsce = new TextInputBuilder()
            .setCustomId("miejsce")
            .setLabel("📍 Miejsce służby")
            .setPlaceholder("np. Zakład Karny Warszawa")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        // RODZAJ
        const rodzaj = new TextInputBuilder()
            .setCustomId("rodzaj")
            .setLabel("🚔 Rodzaj służby")
            .setPlaceholder("np. Patrol / Konwój / Ochrona")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        // PRZEBIEG
        const przebieg = new TextInputBuilder()
            .setCustomId("przebieg")
            .setLabel("📝 Przebieg służby")
            .setPlaceholder(
                "Opisz dokładnie przebieg swojej służby..."
            )
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(1000);

        modal.addComponents(

            new ActionRowBuilder()
                .addComponents(dataSluzby),

            new ActionRowBuilder()
                .addComponents(godziny),

            new ActionRowBuilder()
                .addComponents(miejsce),

            new ActionRowBuilder()
                .addComponents(rodzaj),

            new ActionRowBuilder()
                .addComponents(przebieg)

        );

        return interaction.showModal(modal);
    }

    // ==================================================
    // WYSŁANIE FORMULARZA
    // ==================================================

    if (
        interaction.isModalSubmit() &&
        interaction.customId === "formularz_raportu"
    ) {

        await interaction.deferReply({
            ephemeral: true
        });

        // ==============================================
        // KANAŁ RAPORTÓW
        // ==============================================

        const reportChannel =
            interaction.guild.channels.cache.get(
                REPORT_CHANNEL_ID
            );

        if (!reportChannel) {

            return interaction.editReply({
                content:
                    "❌ Nie znaleziono kanału raportów.\n\n" +
                    "Sprawdź, czy `REPORT_CHANNEL_ID` jest prawidłowe."
            });

        }

        // ==============================================
        // POBIERANIE DANYCH
        // ==============================================

        const dataSluzby =
            interaction.fields.getTextInputValue(
                "data_sluzby"
            );

        const godziny =
            interaction.fields.getTextInputValue(
                "godziny"
            );

        const miejsce =
            interaction.fields.getTextInputValue(
                "miejsce"
            );

        const rodzaj =
            interaction.fields.getTextInputValue(
                "rodzaj"
            );

        const przebieg =
            interaction.fields.getTextInputValue(
                "przebieg"
            );

        // ==============================================
        // TWORZENIE RAPORTU
        // ==============================================

        const reportEmbed = new EmbedBuilder()
            .setColor(0x19a85b)
            .setTitle("📋 NOWY RAPORT SŁUŻBOWY")

            .setDescription(
                "## 👤 Funkcjonariusz\n" +
                `${interaction.user}\n\n` +

                `🆔 **ID użytkownika:** \`${interaction.user.id}\``
            )

            .addFields(

                {
                    name: "📅 Data służby",
                    value: dataSluzby,
                    inline: true
                },

                {
                    name: "⏰ Godziny służby",
                    value: godziny,
                    inline: true
                },

                {
                    name: "📍 Miejsce służby",
                    value: miejsce,
                    inline: false
                },

                {
                    name: "🚔 Rodzaj służby",
                    value: rodzaj,
                    inline: false
                },

                {
                    name: "📝 Przebieg służby",
                    value: przebieg,
                    inline: false
                }

            )

            .setFooter({
                text:
                    "Służba Więzienna • System Raportów"
            })

            .setTimestamp();

        // ==============================================
        // WYSŁANIE RAPORTU
        // ==============================================

        try {

            await reportChannel.send({
                content:
                    `📋 **Nowy raport służbowy** • ${interaction.user}`,

                embeds: [
                    reportEmbed
                ]
            });

        } catch (error) {

            console.error(
                "❌ Nie udało się wysłać raportu:",
                error
            );

            return interaction.editReply({
                content:
                    "❌ Nie udało się wysłać raportu.\n" +
                    "Sprawdź uprawnienia bota do kanału raportów."
            });

        }

        // ==============================================
        // POTWIERDZENIE
        // ==============================================

        return interaction.editReply({
            content:
                "✅ **Raport został wysłany!**\n\n" +
                `📋 Raport trafił do ${reportChannel}.`
        });
    }

});

return commands;
}

module.exports = { registerRaportModule };
