const {
    Client,
    GatewayIntentBits,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    REST,
    Routes
} = require("discord.js");

// ======================================================
// KONFIGURACJA
// ======================================================


// Role, które mają dostęp do ticketów.
// Możesz podać kilka ID po przecinku:
// STAFF_ROLE_IDS=123,456,789
const STAFF_ROLE_IDS = (process.env.STAFF_ROLE_IDS || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);

// RODZAJE DOKUMENTÓW
// ======================================================

const DOCUMENTS = {
    przyjecie: {
        label: "Wniosek o przyjęcie do SW",
        emoji: "📝",
        description: "Złóż wniosek o przyjęcie do Służby Więziennej",
        modalTitle: "Wniosek o przyjęcie",
        fields: [
            {
                id: "imie",
                label: "Imię i nazwisko",
                placeholder: "Np. Jan Kowalski",
                required: true
            },
            {
                id: "wiek",
                label: "Wiek",
                placeholder: "Np. 21",
                required: true
            },
            {
                id: "doswiadczenie",
                label: "Doświadczenie",
                placeholder: "Opisz swoje doświadczenie",
                required: true,
                paragraph: true
            },
            {
                id: "powod",
                label: "Dlaczego chcesz dołączyć do SW?",
                placeholder: "Napisz kilka zdań",
                required: true,
                paragraph: true
            }
        ]
    },

    urlop: {
        label: "Wniosek urlopowy",
        emoji: "📅",
        description: "Złóż wniosek o urlop",
        modalTitle: "Wniosek urlopowy",
        fields: [
            {
                id: "imie",
                label: "Imię i nazwisko",
                placeholder: "Np. Jan Kowalski",
                required: true
            },
            {
                id: "od",
                label: "Urlop od",
                placeholder: "DD.MM.RRRR",
                required: true
            },
            {
                id: "do",
                label: "Urlop do",
                placeholder: "DD.MM.RRRR",
                required: true
            },
            {
                id: "powod",
                label: "Powód urlopu",
                placeholder: "Podaj powód",
                required: true,
                paragraph: true
            }
        ]
    },

    raport: {
        label: "Raport służbowy",
        emoji: "🚔",
        description: "Złóż raport ze służby",
        modalTitle: "Raport służbowy",
        fields: [
            {
                id: "funkcjonariusz",
                label: "Funkcjonariusz",
                placeholder: "Imię i nazwisko / numer SW",
                required: true
            },
            {
                id: "data",
                label: "Data służby",
                placeholder: "DD.MM.RRRR",
                required: true
            },
            {
                id: "godziny",
                label: "Godziny służby",
                placeholder: "Np. 18:00 - 22:00",
                required: true
            },
            {
                id: "opis",
                label: "Przebieg służby",
                placeholder: "Opisz przebieg służby",
                required: true,
                paragraph: true
            }
        ]
    },

    interwencja: {
        label: "Raport z interwencji",
        emoji: "🚨",
        description: "Zgłoś przeprowadzoną interwencję",
        modalTitle: "Raport z interwencji",
        fields: [
            {
                id: "funkcjonariusz",
                label: "Funkcjonariusz",
                placeholder: "Imię i nazwisko / numer SW",
                required: true
            },
            {
                id: "data",
                label: "Data i godzina",
                placeholder: "DD.MM.RRRR, HH:MM",
                required: true
            },
            {
                id: "miejsce",
                label: "Miejsce interwencji",
                placeholder: "Podaj miejsce",
                required: true
            },
            {
                id: "opis",
                label: "Opis interwencji",
                placeholder: "Dokładnie opisz sytuację",
                required: true,
                paragraph: true
            }
        ]
    },

    konwoj: {
        label: "Raport z konwoju",
        emoji: "🚐",
        description: "Złóż raport z przeprowadzonego konwoju",
        modalTitle: "Raport z konwoju",
        fields: [
            {
                id: "funkcjonariusz",
                label: "Funkcjonariusz",
                placeholder: "Imię i nazwisko / numer SW",
                required: true
            },
            {
                id: "data",
                label: "Data konwoju",
                placeholder: "DD.MM.RRRR",
                required: true
            },
            {
                id: "cel",
                label: "Cel konwoju",
                placeholder: "Dokąd odbywał się konwój?",
                required: true
            },
            {
                id: "opis",
                label: "Przebieg konwoju",
                placeholder: "Opisz przebieg konwoju",
                required: true,
                paragraph: true
            }
        ]
    },

    awans: {
        label: "Wniosek o awans",
        emoji: "⚖️",
        description: "Złóż wniosek o awans funkcjonariusza",
        modalTitle: "Wniosek o awans",
        fields: [
            {
                id: "funkcjonariusz",
                label: "Funkcjonariusz",
                placeholder: "Imię i nazwisko / numer SW",
                required: true
            },
            {
                id: "obecny",
                label: "Obecny stopień",
                placeholder: "Podaj obecny stopień",
                required: true
            },
            {
                id: "wnioskowany",
                label: "Wnioskowany stopień",
                placeholder: "Podaj nowy stopień",
                required: true
            },
            {
                id: "uzasadnienie",
                label: "Uzasadnienie",
                placeholder: "Dlaczego funkcjonariusz zasługuje na awans?",
                required: true,
                paragraph: true
            }
        ]
    },

    degradacja: {
        label: "Wniosek o degradację",
        emoji: "📉",
        description: "Złóż wniosek o degradację",
        modalTitle: "Wniosek o degradację",
        fields: [
            {
                id: "funkcjonariusz",
                label: "Funkcjonariusz",
                placeholder: "Imię i nazwisko / numer SW",
                required: true
            },
            {
                id: "stopien",
                label: "Obecny stopień",
                placeholder: "Podaj stopień",
                required: true
            },
            {
                id: "powod",
                label: "Powód degradacji",
                placeholder: "Podaj powód",
                required: true,
                paragraph: true
            },
            {
                id: "dowody",
                label: "Dowody / informacje",
                placeholder: "Podaj dodatkowe informacje",
                required: false,
                paragraph: true
            }
        ]
    },

    nagroda: {
        label: "Wniosek o nagrodę",
        emoji: "🏅",
        description: "Zgłoś funkcjonariusza do nagrody",
        modalTitle: "Wniosek o nagrodę",
        fields: [
            {
                id: "funkcjonariusz",
                label: "Funkcjonariusz",
                placeholder: "Imię i nazwisko / numer SW",
                required: true
            },
            {
                id: "nagroda",
                label: "Rodzaj nagrody",
                placeholder: "Np. pochwała",
                required: true
            },
            {
                id: "uzasadnienie",
                label: "Uzasadnienie",
                placeholder: "Opisz zasługi funkcjonariusza",
                required: true,
                paragraph: true
            }
        ]
    },

    ukaranie: {
        label: "Wniosek o ukaranie",
        emoji: "⚠️",
        description: "Złóż wniosek o ukaranie funkcjonariusza",
        modalTitle: "Wniosek o ukaranie",
        fields: [
            {
                id: "funkcjonariusz",
                label: "Funkcjonariusz",
                placeholder: "Imię i nazwisko / numer SW",
                required: true
            },
            {
                id: "data",
                label: "Data zdarzenia",
                placeholder: "DD.MM.RRRR",
                required: true
            },
            {
                id: "kara",
                label: "Wnioskowana kara",
                placeholder: "Np. nagana",
                required: true
            },
            {
                id: "opis",
                label: "Opis przewinienia",
                placeholder: "Dokładnie opisz sytuację",
                required: true,
                paragraph: true
            }
        ]
    },

    szkolenie: {
        label: "Dokumentacja szkoleniowa",
        emoji: "🎓",
        description: "Dokument dotyczący szkolenia",
        modalTitle: "Dokumentacja szkoleniowa",
        fields: [
            {
                id: "funkcjonariusz",
                label: "Funkcjonariusz",
                placeholder: "Imię i nazwisko / numer SW",
                required: true
            },
            {
                id: "szkolenie",
                label: "Rodzaj szkolenia",
                placeholder: "Podaj rodzaj szkolenia",
                required: true
            },
            {
                id: "wynik",
                label: "Wynik szkolenia",
                placeholder: "Np. zaliczone",
                required: true
            },
            {
                id: "uwagi",
                label: "Uwagi",
                placeholder: "Dodatkowe informacje",
                required: false,
                paragraph: true
            }
        ]
    },

    swef: {
        label: "Dokumentacja SWEF",
        emoji: "👴",
        description: "Dokument dotyczący emerytowanego funkcjonariusza",
        modalTitle: "Dokumentacja SWEF",
        fields: [
            {
                id: "funkcjonariusz",
                label: "Imię i nazwisko",
                placeholder: "Podaj imię i nazwisko",
                required: true
            },
            {
                id: "numer",
                label: "Numer SW",
                placeholder: "Np. SW-01",
                required: true
            },
            {
                id: "stopien",
                label: "Ostatni stopień",
                placeholder: "Podaj ostatni stopień",
                required: true
            },
            {
                id: "informacje",
                label: "Informacje",
                placeholder: "Dodatkowe informacje",
                required: true,
                paragraph: true
            }
        ]
    }
};

// ======================================================
// FUNKCJE
// ======================================================

function isStaff(member) {
    if (!member || STAFF_ROLE_IDS.length === 0) return false;

    return STAFF_ROLE_IDS.some(roleId =>
        member.roles.cache.has(roleId)
    );
}

function createPanelEmbed() {
    return new EmbedBuilder()
        .setTitle("📁 DOKUMENTY SŁUŻBOWE — SŁUŻBA WIĘZIENNA")
        .setDescription(
            "### 📋 Panel dokumentów\n" +
            "Wybierz z listy rodzaj dokumentu, który chcesz złożyć.\n\n" +
            "🔒 Po wysłaniu formularza zostanie utworzony **prywatny ticket**.\n" +
            "👮 Dokument zostanie przekazany do odpowiednich osób z Dowództwa SW.\n\n" +
            "**Nie twórz kilku ticketów dotyczących tej samej sprawy.**"
        )
        .setFooter({
            text: "Służba Więzienna • Dokumenty Służbowe"
        })
        .setTimestamp();
}

function createSelectMenu() {
    const options = Object.entries(DOCUMENTS).map(([value, doc]) => ({
        label: doc.label,
        description: doc.description,
        value,
        emoji: doc.emoji
    }));

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId("document_select")
            .setPlaceholder("📂 Wybierz dokument...")
            .addOptions(options)
    );
}

function createTicketButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("document_approve")
            .setLabel("Zatwierdź")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId("document_reject")
            .setLabel("Odrzuć")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId("document_close")
            .setLabel("Zamknij")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Secondary)
    );
}

function buildModal(documentId) {
    const document = DOCUMENTS[documentId];

    const modal = new ModalBuilder()
        .setCustomId(`document_modal_${documentId}`)
        .setTitle(document.modalTitle);

    const rows = document.fields.slice(0, 5).map(field => {
        const input = new TextInputBuilder()
            .setCustomId(field.id)
            .setLabel(field.label)
            .setPlaceholder(field.placeholder)
            .setRequired(field.required)
            .setStyle(
                field.paragraph
                    ? TextInputStyle.Paragraph
                    : TextInputStyle.Short
            );

        return new ActionRowBuilder().addComponents(input);
    });

    modal.addComponents(rows);

    return modal;
}

// ======================================================
// READY
// ======================================================

const commands = [{
  name: 'setup-dokumenty',
  description: 'Tworzy panel dokumentów służbowych SW',
  default_member_permissions: PermissionFlagsBits.Administrator.toString()
}];

function registerDokumentyModule(client) {
client.on("interactionCreate", async interaction => {

    // ==================================================
    // /setup-dokumenty
    // ==================================================

    if (interaction.isChatInputCommand()) {

        if (interaction.commandName === "setup-dokumenty") {

            if (!interaction.memberPermissions.has(
                PermissionFlagsBits.Administrator
            )) {
                return interaction.reply({
                    content: "❌ Nie masz uprawnień do tej komendy.",
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const guild = interaction.guild;

            // Kategoria
            let category = guild.channels.cache.find(
                channel =>
                    channel.type === ChannelType.GuildCategory &&
                    channel.name === "📁・DOKUMENTY SŁUŻBOWE"
            );

            if (!category) {
                category = await guild.channels.create({
                    name: "📁・DOKUMENTY SŁUŻBOWE",
                    type: ChannelType.GuildCategory
                });
            }

            // Kanał panelu
            let panelChannel = guild.channels.cache.find(
                channel =>
                    channel.type === ChannelType.GuildText &&
                    channel.name === "🎫・dokumenty-służbowe"
            );

            if (!panelChannel) {
                panelChannel = await guild.channels.create({
                    name: "🎫・dokumenty-służbowe",
                    type: ChannelType.GuildText,
                    parent: category.id
                });
            }

            // Kanał logów
            let logChannel = guild.channels.cache.find(
                channel =>
                    channel.type === ChannelType.GuildText &&
                    channel.name === "📜・logi-dokumentów"
            );

            if (!logChannel) {
                logChannel = await guild.channels.create({
                    name: "📜・logi-dokumentów",
                    type: ChannelType.GuildText,
                    parent: category.id
                });
            }

            await panelChannel.send({
                embeds: [createPanelEmbed()],
                components: [createSelectMenu()]
            });

            await interaction.editReply({
                content:
                    `✅ Gotowe!\n\n` +
                    `🎫 Panel: ${panelChannel}\n` +
                    `📜 Logi: ${logChannel}\n\n` +
                    `Teraz funkcjonariusze mogą składać dokumenty przez tickety.`
            });

            return;
        }
    }

    // ==================================================
    // WYBÓR DOKUMENTU
    // ==================================================

    if (interaction.isStringSelectMenu()) {

        if (interaction.customId === "document_select") {

            const documentId = interaction.values[0];

            if (!DOCUMENTS[documentId]) {
                return interaction.reply({
                    content: "❌ Nieprawidłowy rodzaj dokumentu.",
                    ephemeral: true
                });
            }

            const modal = buildModal(documentId);

            await interaction.showModal(modal);

            return;
        }
    }

    // ==================================================
    // FORMULARZ
    // ==================================================

    if (interaction.isModalSubmit()) {

        if (!interaction.customId.startsWith("document_modal_")) {
            return;
        }

        const documentId =
            interaction.customId.replace("document_modal_", "");

        const document = DOCUMENTS[documentId];

        if (!document) {
            return interaction.reply({
                content: "❌ Nie znaleziono dokumentu.",
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;

        // Sprawdzamy, czy użytkownik już ma otwarty ticket
        const existingTicket = guild.channels.cache.find(
            channel =>
                channel.type === ChannelType.GuildText &&
                channel.topic === `document-ticket:${interaction.user.id}`
        );

        if (existingTicket) {
            return interaction.editReply({
                content:
                    `❌ Masz już otwarty dokument:\n${existingTicket}`
            });
        }

        const category = guild.channels.cache.find(
            channel =>
                channel.type === ChannelType.GuildCategory &&
                channel.name === "📁・DOKUMENTY SŁUŻBOWE"
        );

        if (!category) {
            return interaction.editReply({
                content:
                    "❌ Nie znaleziono kategorii dokumentów. Administrator musi użyć `/setup-dokumenty`."
            });
        }

        const safeName = interaction.user.username
            .toLowerCase()
            .replace(/[^a-z0-9ąćęłńóśźż_-]/gi, "")
            .slice(0, 15);

        const channel = await guild.channels.create({
            name: `📄・${documentId}-${safeName}`,
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `document-ticket:${interaction.user.id}`,

            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [
                        PermissionFlagsBits.ViewChannel
                    ]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles
                    ]
                },

                ...STAFF_ROLE_IDS.map(roleId => ({
                    id: roleId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.ManageMessages
                    ]
                }))
            ]
        });

        const fields = document.fields.map(field => {
            const value = interaction.fields.getTextInputValue(field.id);

            return {
                name: field.label,
                value: value || "Brak danych",
                inline: !field.paragraph
            };
        });

        const embed = new EmbedBuilder()
            .setTitle(`${document.emoji} ${document.label}`)
            .setDescription(
                `Dokument został złożony przez ${interaction.user}.\n\n` +
                `**Status:** 🟡 Oczekuje na rozpatrzenie`
            )
            .addFields(fields)
            .setFooter({
                text: `ID użytkownika: ${interaction.user.id}`
            })
            .setTimestamp();

        await channel.send({
            content:
                `👮 ${interaction.user}\n` +
                `${STAFF_ROLE_IDS.map(id => `<@&${id}>`).join(" ")}`,
            embeds: [embed],
            components: [createTicketButtons()]
        });

        await interaction.editReply({
            content:
                `✅ Dokument został złożony!\n\n` +
                `🎫 Twój ticket: ${channel}`
        });

        // Log
        const logChannel = guild.channels.cache.find(
            channel =>
                channel.type === ChannelType.GuildText &&
                channel.name === "📜・logi-dokumentów"
        );

        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle("📄 Nowy dokument")
                .setColor(0x3498db)
                .addFields(
                    {
                        name: "👤 Złożył",
                        value: `${interaction.user} (${interaction.user.id})`
                    },
                    {
                        name: "📋 Dokument",
                        value: document.label
                    },
                    {
                        name: "🎫 Ticket",
                        value: `${channel}`
                    }
                )
                .setTimestamp();

            await logChannel.send({
                embeds: [logEmbed]
            });
        }

        return;
    }

    // ==================================================
    // PRZYCISKI
    // ==================================================

    if (interaction.isButton()) {

        if (
            ![
                "document_approve",
                "document_reject",
                "document_close"
            ].includes(interaction.customId)
        ) {
            return;
        }

        const channel = interaction.channel;

        if (!channel || !channel.topic?.startsWith("document-ticket:")) {
            return interaction.reply({
                content: "❌ To nie jest ticket dokumentu.",
                ephemeral: true
            });
        }

        const ownerId = channel.topic.split(":")[1];

        // ==============================================
        // ZAMKNIĘCIE
        // ==============================================

        if (interaction.customId === "document_close") {

            if (
                interaction.user.id !== ownerId &&
                !isStaff(interaction.member) &&
                !interaction.memberPermissions.has(
                    PermissionFlagsBits.Administrator
                )
            ) {
                return interaction.reply({
                    content: "❌ Nie możesz zamknąć tego ticketu.",
                    ephemeral: true
                });
            }

            await interaction.reply({
                content: "🔒 Ticket zostanie zamknięty za 5 sekund."
            });

            const logChannel = interaction.guild.channels.cache.find(
                channel =>
                    channel.type === ChannelType.GuildText &&
                    channel.name === "📜・logi-dokumentów"
            );

            if (logChannel) {
                await logChannel.send(
                    `🔒 Ticket **${channel.name}** został zamknięty przez ${interaction.user}.`
                );
            }

            setTimeout(async () => {
                try {
                    await channel.delete();
                } catch {}
            }, 5000);

            return;
        }

        // ==============================================
        // TYLKO DOWÓDZTWO
        // ==============================================

        if (
            !isStaff(interaction.member) &&
            !interaction.memberPermissions.has(
                PermissionFlagsBits.Administrator
            )
        ) {
            return interaction.reply({
                content:
                    "❌ Tylko Dowództwo SW może zatwierdzać lub odrzucać dokumenty.",
                ephemeral: true
            });
        }

        // ==============================================
        // ZATWIERDZENIE
        // ==============================================

        if (interaction.customId === "document_approve") {

            const embed = new EmbedBuilder()
                .setTitle("✅ DOKUMENT ZATWIERDZONY")
                .setDescription(
                    `Dokument został zatwierdzony przez ${interaction.user}.\n\n` +
                    `Ticket zostanie zamknięty po zakończeniu obsługi.`
                )
                .setTimestamp();

            await interaction.reply({
                embeds: [embed]
            });

            const logChannel = interaction.guild.channels.cache.find(
                channel =>
                    channel.type === ChannelType.GuildText &&
                    channel.name === "📜・logi-dokumentów"
            );

            if (logChannel) {
                await logChannel.send(
                    `✅ Dokument **${channel.name}** został zatwierdzony przez ${interaction.user}.`
                );
            }

            return;
        }

        // ==============================================
        // ODRZUCENIE
        // ==============================================

        if (interaction.customId === "document_reject") {

            const embed = new EmbedBuilder()
                .setTitle("❌ DOKUMENT ODRZUCONY")
                .setDescription(
                    `Dokument został odrzucony przez ${interaction.user}.\n\n` +
                    `Jeżeli potrzebujesz ponownie złożyć dokument, utwórz nowy ticket.`
                )
                .setTimestamp();

            await interaction.reply({
                embeds: [embed]
            });

            const logChannel = interaction.guild.channels.cache.find(
                channel =>
                    channel.type === ChannelType.GuildText &&
                    channel.name === "📜・logi-dokumentów"
            );

            if (logChannel) {
                await logChannel.send(
                    `❌ Dokument **${channel.name}** został odrzucony przez ${interaction.user}.`
                );
            }

            return;
        }
    }
});

// ======================================================
// LOGOWANIE
// ======================================================

return commands;
}

module.exports = { registerDokumentyModule };
