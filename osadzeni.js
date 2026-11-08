const {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const management = require("./services/management");
const validate = require("./services/domain-validation");
const storage = require("./services/storage");
const { createPrisonerNotifications } = require("./services/discord-notifications");
const { createPassNotifications } = require("./services/pass-notifications");
const { buildPassEmbed, buildPassButtons } = require("./services/pass-content");
const fs = require("fs");
const path = require("path");

// Rejestr osadzonych korzysta ze wspólnego klienta głównego bota.

const STAFF_ROLE_NAMES = [
    "Generał Inspektor SW ⚖️👑",
    "Generał SW ⚖️⭐",
    "Dowódca zmiany",
    "zca. Dowódca zmiany"
];

// TYLKO ta ranga może pauzować/wznawiać/zmieniać czas kary.
const TIMER_FULL_ROLE_NAMES = [
    "Generał Inspektor SW ⚖️👑",
    "Generał SW ⚖️⭐"
];
const TIMER_EMPLOYEE_ROLE_NAME = "Pracownik SW";

const CHANNEL_OSADZENI = "📍・osadzeni";
const CHANNEL_PRZEPUSTKI = "🎫・przepustki";
const CHANNEL_LOGI = "📜・logi-osadzeni";

const MINUTES_PER_MONTH = 10;
const MINUTES_PER_YEAR = 60;
const TIMER_REFRESH_MS = 15000;
let refreshTimer;

const DATA_DIR = process.env.SW_DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "osadzeni.json");

function loadDatabase() {
    return storage.readJson(DATA_FILE, { nextId: 1, nextPassId: 1, osadzeni: [], przepustki: [] }, data =>
        Array.isArray(data.osadzeni) && Array.isArray(data.przepustki) && Number.isSafeInteger(data.nextId) && data.nextId > 0 &&
        (data.nextPassId === undefined || (Number.isSafeInteger(data.nextPassId) && data.nextPassId > 0)));
}
const db = loadDatabase();
const largestPassId = db.przepustki.reduce((largest, item) => {
    const match = /^P-(\d+)$/i.exec(String(item?.id || ""));
    if (!match) return largest;
    const value = Number(match[1]);
    if (!Number.isSafeInteger(value) || value >= Number.MAX_SAFE_INTEGER) throw new Error("Nieprawidłowy numer istniejącej przepustki; bazę zachowano bez zmian.");
    return Math.max(largest, value);
}, 0);
// Preserve legacy records and a counter that survives deletion of earlier requests.
db.nextPassId = Math.max(db.nextPassId || 1, largestPassId + 1);
function saveDatabase() { storage.writeJson(DATA_FILE, db); }

function registerOsadzeniModule(client) {
const notifications = createPrisonerNotifications({
    client, getRecord: getOsadzony,
    saveReference(id, reference) {
        const prisoner = getOsadzony(id);
        if (prisoner) { Object.assign(prisoner, reference); saveDatabase(); }
    },
    buildCard: item => buildOsadzonyEmbed(item, false), buildButtons: buildTimerButtons,
});
management.registerNotifications(notifications);
const passNotifications = createPassNotifications({
    client, getRecord: getPass, dataDir: DATA_DIR,
    saveReference(id, reference) {
        const pass = getPass(id);
        if (pass) { Object.assign(pass, reference); saveDatabase(); }
    },
    buildCard: buildPassEmbed, buildButtons: buildPassButtons,
    refreshPrisoner(id) {
        const prisoner = getOsadzony(id);
        if (prisoner) return refreshOsadzonyMessage(prisoner);
    },
});
management.registerNotifications(passNotifications, "passes");
management.registerResource("passes", {
    list: () => db.przepustki.map(item => ({ ...item })),
    create: createPass,
    decide: decidePass,
    afterMutation(action, item, actor) { return passNotifications.enqueue(action, item, actor); },
});
management.registerResource("prisoners", {
    list() { let changed = false; for (const item of db.osadzeni) if (ensureTimer(item)) changed = true; if (changed) saveDatabase(); return db.osadzeni.map(item => ({ ...item })); },
    create(input, { actor = "panel", role = "admin" } = {}) {
        const item = validatePrisoner(input, undefined, { role });
        item.id = createOsadzonyId(); item.dodanyPrzez = actor; item.utworzono = new Date().toISOString();
        db.osadzeni.push(item); saveDatabase(); return { ...item };
    },
    update(id, input, { role = "admin" } = {}) {
        const previous = validate.present(getOsadzony(id));
        if (input.id && input.id !== previous.id) validate.fail("Nie można zmienić ID osadzonego.");
        const item = validatePrisoner(input, previous, { role });
        Object.assign(previous, item); saveDatabase();
        return { ...previous };
    },
    remove(id) {
        const previous = validate.present(getOsadzony(id));
        db.osadzeni = db.osadzeni.filter(item => item !== previous);
        db.przepustki = db.przepustki.filter(item => item.osadzonyId !== previous.id);
        saveDatabase(); return { ...previous };
    },
    afterMutation(action, item, actor) { return notifications.enqueue(action, item, actor); }
});
function validatePrisoner(input, previous, { role = "admin" } = {}) {
    if (Object.hasOwn(input, "przepustka") && role !== "admin" && (previous || input.przepustka !== false)) {
        validate.fail("Tylko administrator może zmieniać uprawnienie przepustki.", 403);
    }
    const item = { ...(previous || {}), ...input };
    item.imie = validate.text(input.imie ?? input.name ?? previous?.imie, "imię i nazwisko", 150);
    item.paragraf = validate.text(input.paragraf ?? input.reason ?? previous?.paragraf, "paragraf", 500);
    item.wyrok = validate.text(item.wyrok || "Brak opisu", "wyrok", 500);
    item.cela = validate.text(item.cela, "cela", 50);
    item.uwagi = validate.text(item.uwagi || "Brak", "uwagi", 2000);
    for (const key of ["poczatek", "koniec"]) {
        item[key] = validate.text(item[key], key, 5);
        if (!parseTime(item[key])) validate.fail("Godziny kary muszą mieć format HH:MM.");
    }
    const duration = calculateDurationBetween(item.poczatek, item.koniec);
    if (!duration) validate.fail("Początek i koniec kary muszą być różne.");
    if (input.paused !== undefined && typeof input.paused !== "boolean") validate.fail("Nieprawidłowa pauza kary.");
    if (Object.hasOwn(input, "przepustka") && typeof input.przepustka !== "boolean") validate.fail("Przepustka musi mieć wartość tak lub nie.");
    const resetTime = !previous || item.poczatek !== previous.poczatek || item.koniec !== previous.koniec;
    if (previous) { const snapshot = { ...previous }; ensureTimer(snapshot); item.remainingSeconds = snapshot.remainingSeconds; }
    if (resetTime) item.remainingSeconds = duration * 60;
    if (input.remainingSeconds !== undefined) item.remainingSeconds = validate.integer(input.remainingSeconds, "pozostały czas", 0, 31536000);
    item.paused = input.paused ?? previous?.paused ?? false;
    item.timerStartedAt = new Date().toISOString();
    item.czasKaryMinuty = duration; item.czasZWyrokuMinuty = calculateSentenceMinutes(item.wyrok);
    item.przepustka = input.przepustka ?? previous?.przepustka ?? false;
    // Only persist supported fields; never accept caller-owned Discord message identifiers.
    return { id: previous?.id, imie:item.imie, paragraf:item.paragraf, wyrok:item.wyrok, cela:item.cela,
      uwagi:item.uwagi, poczatek:item.poczatek, koniec:item.koniec, remainingSeconds:item.remainingSeconds,
      paused:item.paused,timerStartedAt:item.timerStartedAt,czasKaryMinuty:item.czasKaryMinuty,
      czasZWyrokuMinuty:item.czasZWyrokuMinuty,przepustka:item.przepustka };
}

function getPass(id) {
    return db.przepustki.find(item => typeof item?.id === "string" && item.id.toLowerCase() === String(id).toLowerCase());
}

function passInput(input, allowed) {
    if (!input || typeof input !== "object" || Array.isArray(input)) validate.fail("Nieprawidłowe dane wniosku o przepustkę.");
    for (const key of Object.keys(input)) if (!allowed.includes(key)) validate.fail(`Niedozwolone pole wniosku: ${key}.`);
}

function createPass(input, { actor = "panel", role = "admin" } = {}) {
    if (!["admin", "operator"].includes(role)) validate.fail("Nie masz uprawnień do składania wniosków o przepustkę.", 403);
    passInput(input, ["osadzonyId", "od", "do", "powod", "miejsce"]);
    const prisonerId = validate.text(input.osadzonyId, "ID osadzonego", 64);
    const prisoner = validate.present(getOsadzony(prisonerId), "Nie znaleziono osadzonego.");
    const start = validate.text(input.od, "początek przepustki", 5);
    const end = validate.text(input.do, "koniec przepustki", 5);
    if (!parseTime(start) || !parseTime(end)) validate.fail("Godziny przepustki muszą mieć format HH:MM.");
    if (start === end) validate.fail("Początek i koniec przepustki muszą być różne.");
    const reason = validate.text(input.powod, "powód przepustki", 1000);
    const place = validate.text(input.miejsce, "miejsce przepustki", 200);
    if (!Number.isSafeInteger(db.nextPassId) || db.nextPassId >= Number.MAX_SAFE_INTEGER) validate.fail("Wyczerpano zakres numerów przepustek.", 409);
    const request = { id: `P-${String(db.nextPassId).padStart(3, "0")}`, osadzonyId: prisoner.id, osadzony: prisoner.imie,
        od: start, do: end, powod: reason, miejsce: place, status: "oczekuje",
        zlozyl: validate.text(String(actor), "wnioskodawcę", 128), utworzono: new Date().toISOString() };
    const counter = db.nextPassId;
    db.nextPassId++;
    db.przepustki.push(request);
    try { saveDatabase(); }
    catch (error) { db.przepustki.splice(db.przepustki.indexOf(request), 1); db.nextPassId = counter; throw error; }
    return { ...request };
}

function decidePass(id, input, { actor = "panel", role = "admin" } = {}) {
    if (role !== "admin") validate.fail("Tylko administrator może rozpatrywać przepustki.", 403);
    passInput(input, ["decision"]);
    if (!["approve", "reject"].includes(input.decision)) validate.fail("Wybierz zatwierdzenie albo odrzucenie przepustki.");
    const pass = validate.present(getPass(validate.text(id, "ID przepustki", 64)), "Nie znaleziono wniosku o przepustkę.");
    if (pass.status !== "oczekuje") validate.fail("Ten wniosek został już rozpatrzony.", 409);
    const prisoner = getOsadzony(pass.osadzonyId);
    if (input.decision === "approve" && !prisoner) validate.fail("Nie znaleziono osadzonego; wniosku nie można zatwierdzić.", 404);
    const reviewer = validate.text(String(actor), "osobę rozpatrującą", 128);
    const previous = { ...pass };
    const granted = prisoner?.przepustka;
    pass.status = input.decision === "approve" ? "zatwierdzona" : "odrzucona";
    pass.rozpatrzyl = reviewer;
    pass.rozpatrzono = new Date().toISOString();
    if (input.decision === "approve") prisoner.przepustka = true;
    try { saveDatabase(); }
    catch (error) {
        for (const key of Object.keys(pass)) if (!Object.hasOwn(previous, key)) delete pass[key];
        Object.assign(pass, previous);
        if (prisoner) { if (granted === undefined) delete prisoner.przepustka; else prisoner.przepustka = granted; }
        throw error;
    }
    return { ...pass };
}

function hasStaffRole(member) {
    if (!member?.roles) return false;
    return STAFF_ROLE_NAMES.some(name => member.roles.cache.some(role => role.name === name));
}

function hasTimerFullRole(member) {
    if (!member?.roles) return false;
    return TIMER_FULL_ROLE_NAMES.some(name => member.roles.cache.some(role => role.name === name));
}

function hasTimerEmployeeRole(member) {
    if (!member?.roles) return false;
    return member.roles.cache.some(role => role.name === TIMER_EMPLOYEE_ROLE_NAME);
}

function hasTimerPermission(interaction, action) {
    if (hasTimerFullRole(interaction.member)) return true;
    return ["pause", "resume"].includes(action) && hasTimerEmployeeRole(interaction.member);
}

function timerPermissionMessage(action) {
    if (["pause", "resume"].includes(action)) {
        return "❌ Pauzę i kontynuowanie kary może wykonywać **Pracownik SW** oraz **Generał Inspektor SW ⚖️👑** i **Generał SW ⚖️⭐**.";
    }
    return "❌ Dodawanie i odejmowanie czasu może wykonywać wyłącznie **Generał Inspektor SW ⚖️👑** oraz **Generał SW ⚖️⭐**.";
}

function isAdmin(interaction) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function hasPermission(interaction) {
    return hasStaffRole(interaction.member) || isAdmin(interaction);
}

function createOsadzonyId() {
    const number = db.nextId++;
    saveDatabase();
    return `O-${String(number).padStart(3, "0")}`;
}

function parseTime(value) {
    if (!value) return null;
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
    if (!match) return null;
    return { hours: Number(match[1]), minutes: Number(match[2]) };
}

function timeToMinutes(value) {
    const time = parseTime(value);
    return time ? time.hours * 60 + time.minutes : null;
}

function minutesToTime(totalMinutes) {
    totalMinutes = ((totalMinutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function calculateSentenceMinutes(sentence) {
    if (!sentence) return 0;
    const text = sentence.toLowerCase().replace(/,/g, ".").trim();
    let total = 0;
    const years = text.match(/(\d+(?:\.\d+)?)\s*(rok|lata|lat)/);
    const months = text.match(/(\d+(?:\.\d+)?)\s*(miesiąc|miesiące|miesięcy)/);
    const minutes = text.match(/(\d+(?:\.\d+)?)\s*(min|mina|minut|minuta|minuty)/);
    if (years) total += Number(years[1]) * MINUTES_PER_YEAR;
    if (months) total += Number(months[1]) * MINUTES_PER_MONTH;
    if (minutes) total += Number(minutes[1]);
    return Math.round(total);
}

function calculateDurationBetween(startTime, endTime) {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    if (start === null || end === null) return null;
    let difference = end - start;
    if (difference < 0) difference += 1440;
    return difference;
}

function ensureTimer(osadzony) {
    if (typeof osadzony.remainingSeconds !== "number") {
        const duration = Number.isFinite(osadzony.czasKaryMinuty)
            ? osadzony.czasKaryMinuty
            : calculateDurationBetween(osadzony.poczatek, osadzony.koniec) || 0;
        osadzony.remainingSeconds = Math.max(0, Math.round(duration * 60));
        osadzony.paused = false;
        osadzony.timerStartedAt = new Date().toISOString();
        return true;
    }
    if (osadzony.paused || !osadzony.timerStartedAt || osadzony.remainingSeconds <= 0) return false;
    const elapsed = Math.floor((Date.now() - new Date(osadzony.timerStartedAt).getTime()) / 1000);
    if (elapsed <= 0) return false;
    osadzony.remainingSeconds = Math.max(0, osadzony.remainingSeconds - elapsed);
    osadzony.timerStartedAt = new Date().toISOString();
    if (osadzony.remainingSeconds === 0) osadzony.paused = true;
    return true;
}

function getRemainingSeconds(osadzony, persist = false) {
    const changed = ensureTimer(osadzony);
    if (changed && persist) saveDatabase();
    return Math.max(0, Math.floor(osadzony.remainingSeconds || 0));
}

function formatRemaining(seconds) {
    if (seconds <= 0) return "✅ KARA ZAKOŃCZONA";
    const totalMinutes = Math.ceil(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `⏳ **${hours} godz. ${minutes} min.**`;
    return `⏳ **${minutes} min.**`;
}

function getEndTime(osadzony, seconds) {
    if (seconds <= 0) return "Zakończona";
    if (osadzony.paused) return "⏸️ WSTRZYMANA";
    const end = Math.floor((Date.now() + seconds * 1000) / 60000);
    return minutesToTime(end);
}

function getOsadzony(id) {
    return db.osadzeni.find(o => o.id.toLowerCase() === id.toLowerCase());
}

function buildTimerButtons(osadzony) {
    const seconds = getRemainingSeconds(osadzony);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`kara_pause_${osadzony.id}`)
            .setLabel(osadzony.paused ? "Wstrzymana" : "Pauza")
            .setEmoji(osadzony.paused ? "⏸️" : "⏸️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(osadzony.paused || seconds <= 0),
        new ButtonBuilder()
            .setCustomId(`kara_resume_${osadzony.id}`)
            .setLabel("Kontynuuj")
            .setEmoji("▶️")
            .setStyle(ButtonStyle.Success)
            .setDisabled(!osadzony.paused || seconds <= 0),
        new ButtonBuilder()
            .setCustomId(`kara_add_${osadzony.id}`)
            .setLabel("Dodaj czas")
            .setEmoji("➕")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`kara_remove_${osadzony.id}`)
            .setLabel("Odejmij czas")
            .setEmoji("➖")
            .setStyle(ButtonStyle.Danger)
    );
}

function buildOsadzonyEmbed(osadzony, persist = true) {
    const seconds = getRemainingSeconds(osadzony, persist);
    const remainingMinutes = Math.ceil(seconds / 60);
    const durationText = osadzony.paused
        ? `⏸️ WSTRZYMANA • ${remainingMinutes} min.`
        : `${remainingMinutes} minut`;

    return new EmbedBuilder()
        .setTitle(`🔒 KARTA OSADZONEGO — ${osadzony.id}`)
        .setDescription(`## 👤 ${osadzony.imie}\n\n${formatRemaining(seconds)}`)
        .addFields(
            { name: "🆔 ID", value: osadzony.id, inline: true },
            { name: "⚖️ Paragraf", value: osadzony.paragraf, inline: true },
            { name: "📋 Wyrok", value: osadzony.wyrok, inline: true },
            { name: "🔒 Cela", value: osadzony.cela, inline: true },
            { name: "🕐 Początek kary", value: osadzony.poczatek, inline: true },
            { name: "🕐 Koniec kary", value: getEndTime(osadzony, seconds), inline: true },
            { name: "⏱️ Długość / pozostało", value: durationText, inline: true },
            { name: "🎫 Przepustka", value: osadzony.przepustka ? "✅ Udzielona" : "❌ Brak", inline: true },
            { name: "📝 Uwagi", value: (osadzony.uwagi || "Brak").slice(0, 1024) },
            ...(osadzony.dodanyPrzez ? [{ name: "Dodano przez", value: String(osadzony.dodanyPrzez).slice(0, 128) }] : [])
        )
        .setFooter({ text: "Służba Więzienna • Rejestr Osadzonych • Sterowanie czasem: Generał Inspektor SW ⚖️👑" })
        .setTimestamp();
}

async function sendLog(guild, embed) {
    const channel = guild?.channels.cache.find(ch => ch.name === CHANNEL_LOGI && ch.isTextBased());
    if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
}

async function refreshOsadzonyMessage(osadzony) {
    if (!osadzony.messageId || !osadzony.channelId) return;
    return notifications.withRecordLock(osadzony.id, async () => {
        try {
            if (!getOsadzony(osadzony.id)) return;
            const channel = await client.channels.fetch(osadzony.channelId);
            if (!channel?.isTextBased() || String(channel.guildId || channel.guild?.id) !== String(process.env.GUILD_ID)) return;
            const message = await channel.messages.fetch(osadzony.messageId);
            if (!getOsadzony(osadzony.id)) return;
            await message.edit({ embeds: [buildOsadzonyEmbed(osadzony)], components: [buildTimerButtons(osadzony)], allowedMentions: { parse: [] } });
        } catch (_) {}
    });
}

const commands = [
    new SlashCommandBuilder()
        .setName("osadzony-dodaj")
        .setDescription("Dodaje osadzonego do rejestru")
        .addStringOption(o => o.setName("imie").setDescription("Imię i nazwisko osadzonego").setRequired(true))
        .addStringOption(o => o.setName("paragraf").setDescription("Paragraf / paragrafy").setRequired(true))
        .addStringOption(o => o.setName("wyrok").setDescription("Np. 1 rok, 6 miesięcy, 30 minut").setRequired(true))
        .addStringOption(o => o.setName("poczatek").setDescription("Początek kary HH:MM").setRequired(true))
        .addStringOption(o => o.setName("koniec").setDescription("Koniec kary HH:MM").setRequired(true))
        .addStringOption(o => o.setName("cela").setDescription("Numer celi").setRequired(true)),
    new SlashCommandBuilder()
        .setName("osadzony-info")
        .setDescription("Pokazuje kartę osadzonego")
        .addStringOption(o => o.setName("id").setDescription("Np. O-001").setRequired(true)),
    new SlashCommandBuilder().setName("osadzeni").setDescription("Pokazuje wszystkich osadzonych"),
    new SlashCommandBuilder()
        .setName("osadzony-usun")
        .setDescription("Usuwa osadzonego z rejestru")
        .addStringOption(o => o.setName("id").setDescription("Np. O-001").setRequired(true)),
    new SlashCommandBuilder()
        .setName("osadzony-edytuj")
        .setDescription("Edytuje dane osadzonego")
        .addStringOption(o => o.setName("id").setDescription("Np. O-001").setRequired(true))
        .addStringOption(o => o.setName("cela").setDescription("Nowa cela").setRequired(false))
        .addStringOption(o => o.setName("paragraf").setDescription("Nowy paragraf").setRequired(false))
        .addStringOption(o => o.setName("wyrok").setDescription("Nowy wyrok").setRequired(false))
        .addStringOption(o => o.setName("poczatek").setDescription("Nowy początek HH:MM").setRequired(false))
        .addStringOption(o => o.setName("koniec").setDescription("Nowy koniec HH:MM").setRequired(false))
        .addStringOption(o => o.setName("uwagi").setDescription("Uwagi").setRequired(false)),
    new SlashCommandBuilder()
        .setName("przepustka")
        .setDescription("Składa wniosek o przepustkę")
        .addStringOption(o => o.setName("id").setDescription("ID osadzonego, np. O-001").setRequired(true))
        .addStringOption(o => o.setName("od").setDescription("Od godziny HH:MM").setRequired(true))
        .addStringOption(o => o.setName("do").setDescription("Do godziny HH:MM").setRequired(true))
        .addStringOption(o => o.setName("powod").setDescription("Powód przepustki").setRequired(true))
        .addStringOption(o => o.setName("miejsce").setDescription("Miejsce pobytu").setRequired(true)),
    new SlashCommandBuilder().setName("przepustki").setDescription("Pokazuje oczekujące przepustki")
].map(c => c.toJSON());

client.once("ready", () => {
    // Automatyczne odświeżanie kart osadzonych co 15 sekund.
    refreshTimer = setInterval(async () => {
        let changed = false;
        for (const osadzony of db.osadzeni) {
            if (ensureTimer(osadzony)) changed = true;
            await refreshOsadzonyMessage(osadzony);
        }
        if (changed) saveDatabase();
    }, TIMER_REFRESH_MS);
    refreshTimer.unref();
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isModalSubmit()) return;

    // ==================================================
    // DODAJ OSADZONEGO
    // ==================================================
    if (interaction.isChatInputCommand() && interaction.commandName === "osadzony-dodaj") {
        if (!hasPermission(interaction)) return interaction.reply({ content: "❌ Nie masz uprawnień do dodawania osadzonych.", ephemeral: true });

        const imie = interaction.options.getString("imie");
        const paragraf = interaction.options.getString("paragraf");
        const wyrok = interaction.options.getString("wyrok");
        const poczatek = interaction.options.getString("poczatek");
        const koniec = interaction.options.getString("koniec");
        const cela = interaction.options.getString("cela");

        if (!parseTime(poczatek)) return interaction.reply({ content: "❌ Nieprawidłowy początek kary. Użyj `HH:MM`.", ephemeral: true });
        if (!parseTime(koniec)) return interaction.reply({ content: "❌ Nieprawidłowy koniec kary. Użyj `HH:MM`.", ephemeral: true });

        const duration = calculateDurationBetween(poczatek, koniec);
        if (duration === null || duration <= 0) return interaction.reply({ content: "❌ Koniec kary musi być późniejszy od początku albo kara musi przechodzić przez północ.", ephemeral: true });

        const id = createOsadzonyId();
        const osadzony = {
            id, imie, paragraf, wyrok, poczatek, koniec, cela,
            uwagi: "Brak", przepustka: false,
            czasKaryMinuty: duration,
            czasZWyrokuMinuty: calculateSentenceMinutes(wyrok),
            remainingSeconds: duration * 60,
            paused: false,
            timerStartedAt: new Date().toISOString(),
            dodanyPrzez: interaction.user.id,
            utworzono: new Date().toISOString()
        };

        db.osadzeni.push(osadzony);
        saveDatabase();

        await interaction.reply({ embeds: [buildOsadzonyEmbed(osadzony)], components: [buildTimerButtons(osadzony)] });
        const message = await interaction.fetchReply();
        osadzony.messageId = message.id;
        osadzony.channelId = message.channelId;
        saveDatabase();

        await sendLog(interaction.guild, new EmbedBuilder()
            .setTitle("📥 NOWY OSADZONY")
            .setDescription(`${interaction.user} dodał **${imie}** do rejestru.`)
            .addFields({ name: "🆔 ID", value: id }, { name: "🕐 Kara", value: `${poczatek} → ${koniec}` })
            .setTimestamp());
        return;
    }

    // ==================================================
    // INFO
    // ==================================================
    if (interaction.isChatInputCommand() && interaction.commandName === "osadzony-info") {
        if (!hasPermission(interaction)) return interaction.reply({ content: "❌ Nie masz dostępu do rejestru.", ephemeral: true });
        const osadzony = getOsadzony(interaction.options.getString("id"));
        if (!osadzony) return interaction.reply({ content: "❌ Nie znaleziono osadzonego.", ephemeral: true });
        return interaction.reply({ embeds: [buildOsadzonyEmbed(osadzony)], components: [buildTimerButtons(osadzony)], ephemeral: true });
    }

    // ==================================================
    // LISTA
    // ==================================================
    if (interaction.isChatInputCommand() && interaction.commandName === "osadzeni") {
        if (!hasPermission(interaction)) return interaction.reply({ content: "❌ Nie masz dostępu do rejestru.", ephemeral: true });
        if (!db.osadzeni.length) return interaction.reply({ content: "📭 Aktualnie brak osadzonych.", ephemeral: true });
        let lista = db.osadzeni.map(o => {
            const seconds = getRemainingSeconds(o, true);
            return `**${o.id}** • ${o.imie}\n⚖️ ${o.paragraf} • 🔒 Cela ${o.cela}\n${o.paused ? "⏸️" : "⏳"} ${Math.ceil(seconds / 60)} min.`;
        }).join("\n\n");
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle("📍 REJESTR OSADZONYCH").setDescription(lista).setFooter({ text: `Liczba osadzonych: ${db.osadzeni.length}` }).setTimestamp()] });
    }

    // ==================================================
    // USUŃ
    // ==================================================
    if (interaction.isChatInputCommand() && interaction.commandName === "osadzony-usun") {
        if (!hasPermission(interaction)) return interaction.reply({ content: "❌ Nie masz uprawnień.", ephemeral: true });
        const index = db.osadzeni.findIndex(o => o.id.toLowerCase() === interaction.options.getString("id").toLowerCase());
        if (index === -1) return interaction.reply({ content: "❌ Nie znaleziono osadzonego.", ephemeral: true });
        const removed = db.osadzeni.splice(index, 1)[0];
        saveDatabase();
        await interaction.reply({ content: `✅ Usunięto **${removed.imie} (${removed.id})** z rejestru.` });
        await sendLog(interaction.guild, new EmbedBuilder().setTitle("🗑️ USUNIĘTO OSADZONEGO").setDescription(`${interaction.user} usunął **${removed.imie}** (${removed.id}).`).setTimestamp());
        return;
    }

    // ==================================================
    // EDYTUJ
    // ==================================================
    if (interaction.isChatInputCommand() && interaction.commandName === "osadzony-edytuj") {
        if (!hasPermission(interaction)) return interaction.reply({ content: "❌ Nie masz uprawnień.", ephemeral: true });
        const osadzony = getOsadzony(interaction.options.getString("id"));
        if (!osadzony) return interaction.reply({ content: "❌ Nie znaleziono osadzonego.", ephemeral: true });
        const cela = interaction.options.getString("cela");
        const paragraf = interaction.options.getString("paragraf");
        const wyrok = interaction.options.getString("wyrok");
        const poczatek = interaction.options.getString("poczatek");
        const koniec = interaction.options.getString("koniec");
        const uwagi = interaction.options.getString("uwagi");
        const changes = Object.fromEntries(Object.entries({ cela, paragraf, wyrok, poczatek, koniec, uwagi }).filter(([, value]) => value !== null && value !== undefined));
        try { Object.assign(osadzony, validatePrisoner(changes, osadzony)); }
        catch (error) { return interaction.reply({ content: "❌ " + error.message, ephemeral: true }); }
        saveDatabase();
        await interaction.reply({ content: `✅ Zaktualizowano dane osadzonego **${osadzony.imie} (${osadzony.id})**.` });
        await refreshOsadzonyMessage(osadzony);
        return;
    }

    // ==================================================
    // PRZEPUSTKA
    // ==================================================
    if (interaction.isChatInputCommand() && interaction.commandName === "przepustka") {
        if (!hasPermission(interaction)) return interaction.reply({ content: "❌ Nie masz uprawnień.", ephemeral: true });
        const deferred = typeof interaction.deferReply === "function" && typeof interaction.editReply === "function";
        if (deferred) await interaction.deferReply({ ephemeral: true });
        const reply = payload => deferred ? interaction.editReply(payload) : interaction.reply({ ...payload, ephemeral: true });
        let request;
        try {
            request = createPass({ osadzonyId: interaction.options.getString("id"), od: interaction.options.getString("od"),
                do: interaction.options.getString("do"), powod: interaction.options.getString("powod"), miejsce: interaction.options.getString("miejsce") },
                { actor: interaction.user.id, role: "admin" });
        } catch (error) { return reply({ content: `❌ ${error.message}`, allowedMentions: { parse: [] } }); }
        management.recordDiscord("passes", request, interaction.user.id);
        let publication;
        try {
            publication = await passNotifications.enqueue("create", request, interaction.user.id);
        } catch (error) {
            console.error("Wniosek zapisano, ale nie przygotowano kolejki karty przepustki:", error.message);
            publication = { status: "failed", message: "Wniosek został zapisany, ale nie udało się zapisać kolejki karty. Sprawdź dziennik bota i kanał przepustek przed ponowieniem." };
        }
        await reply({ content: `✅ Wniosek **${request.id}** został złożony. ${publication.message}`, allowedMentions: { parse: [] } });
        await sendLog(interaction.guild, new EmbedBuilder().setTitle("🎫 NOWY WNIOSEK O PRZEPUSTKĘ")
            .setDescription(`${interaction.user} złożył wniosek dla **${request.osadzony} (${request.osadzonyId})**.`)
            .addFields({ name: "ID wniosku", value: request.id }).setTimestamp());
        return;
    }

    // ==================================================
    // PRZEPUSTKI
    // ==================================================
    if (interaction.isChatInputCommand() && interaction.commandName === "przepustki") {
        if (!hasPermission(interaction)) return interaction.reply({ content: "❌ Nie masz uprawnień.", ephemeral: true });
        const oczekujace = db.przepustki.filter(p => p.status === "oczekuje");
        if (!oczekujace.length) return interaction.reply({ content: "📭 Brak oczekujących wniosków o przepustkę.", ephemeral: true });
        const entries = [];
        let length = 0;
        for (const pass of oczekujace) {
            const entry = `**${String(pass.id).slice(0, 64)}** • ${String(pass.osadzony || "Brak nazwiska").slice(0, 150)} (${String(pass.osadzonyId).slice(0, 64)})\n🕐 ${String(pass.od).slice(0, 5)} → ${String(pass.do).slice(0, 5)}\n📍 ${String(pass.miejsce || "Brak").slice(0, 200)}\n📝 ${String(pass.powod || "Brak").slice(0, 500)}`;
            if (length + entry.length > 3700) break;
            entries.push(entry); length += entry.length + 2;
        }
        const more = entries.length < oczekujace.length ? `\n\nPokazano ${entries.length} z ${oczekujace.length} wniosków. Pełna lista jest dostępna w panelu.` : "";
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🎫 OCZEKUJĄCE PRZEPUSTKI").setDescription(entries.join("\n\n") + more).setTimestamp()], ephemeral: true, allowedMentions: { parse: [] } });
    }

    // ==================================================
    // STEROWANIE KARĄ: PAUZA / KONTYNUUJ / ZMIANA CZASU
    // ==================================================
    if (interaction.isButton() && interaction.customId.startsWith("kara_")) {
        const [, action, id] = interaction.customId.split("_");
        if (!hasTimerPermission(interaction, action)) {
            return interaction.reply({ content: `❌ Nie masz uprawnień do sterowania czasem kary.`, ephemeral: true });
        }
        const osadzony = getOsadzony(id);
        if (!osadzony) return interaction.reply({ content: "❌ Nie znaleziono osadzonego.", ephemeral: true });
        const seconds = getRemainingSeconds(osadzony, true);

        if (action === "pause") {
            if (osadzony.paused || seconds <= 0) return interaction.reply({ content: "❌ Kara jest już wstrzymana albo zakończona.", ephemeral: true });
            osadzony.paused = true;
            osadzony.timerStartedAt = null;
            saveDatabase();
            await interaction.update({ embeds: [buildOsadzonyEmbed(osadzony)], components: [buildTimerButtons(osadzony)] });
            await sendLog(interaction.guild, new EmbedBuilder().setTitle("⏸️ WSTRZYMANO KARĘ").setDescription(`${interaction.user} wstrzymał karę **${osadzony.imie} (${osadzony.id})**.`).setTimestamp());
            return;
        }

        if (action === "resume") {
            if (!osadzony.paused || seconds <= 0) return interaction.reply({ content: "❌ Kara jest już aktywna albo zakończona.", ephemeral: true });
            osadzony.paused = false;
            osadzony.timerStartedAt = new Date().toISOString();
            saveDatabase();
            await interaction.update({ embeds: [buildOsadzonyEmbed(osadzony)], components: [buildTimerButtons(osadzony)] });
            await sendLog(interaction.guild, new EmbedBuilder().setTitle("▶️ WZNOWIONO KARĘ").setDescription(`${interaction.user} wznowił karę **${osadzony.imie} (${osadzony.id})**.`).setTimestamp());
            return;
        }

        if (action === "add" || action === "remove") {
            const modal = new ModalBuilder()
                .setCustomId(`kara_modal_${action}_${osadzony.id}`)
                .setTitle(action === "add" ? "➕ Dodaj czas kary" : "➖ Odejmij czas kary");
            const input = new TextInputBuilder()
                .setCustomId("minutes")
                .setLabel("Liczba minut")
                .setPlaceholder("np. 30")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(5);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
    }

    // ==================================================
    // MODAL ZMIANY CZASU
    // ==================================================
    if (interaction.isModalSubmit() && interaction.customId.startsWith("kara_modal_")) {
        const [, , action, id] = interaction.customId.split("_");
        if (!["add", "remove"].includes(action)) return;
        if (!hasTimerPermission(interaction, action)) return interaction.reply({ content: "❌ Nie masz uprawnień do zmiany czasu kary.", ephemeral: true });
        const osadzony = getOsadzony(id);
        if (!osadzony) return interaction.reply({ content: "❌ Nie znaleziono osadzonego.", ephemeral: true });
        const amount = Number.parseInt(interaction.fields.getTextInputValue("minutes"), 10);
        if (!Number.isInteger(amount) || amount <= 0 || amount > 100000) return interaction.reply({ content: "❌ Podaj liczbę minut od 1 do 100000.", ephemeral: true });

        let seconds = getRemainingSeconds(osadzony, true);
        const delta = amount * 60;
        seconds = action === "add" ? seconds + delta : Math.max(0, seconds - delta);
        osadzony.remainingSeconds = seconds;
        if (seconds <= 0) {
            osadzony.paused = true;
            osadzony.timerStartedAt = null;
        } else if (!osadzony.paused) {
            osadzony.timerStartedAt = new Date().toISOString();
        }
        osadzony.czasKaryMinuty = Math.ceil(seconds / 60);
        saveDatabase();

        const actionText = action === "add" ? `dodano **${amount} min.**` : `odjęto **${amount} min.**`;
        await interaction.reply({ content: `✅ ${actionText} dla **${osadzony.imie} (${osadzony.id})**.`, ephemeral: true });
        await refreshOsadzonyMessage(osadzony);
        await sendLog(interaction.guild, new EmbedBuilder().setTitle(action === "add" ? "➕ ZMIENIONO CZAS KARY" : "➖ ZMIENIONO CZAS KARY").setDescription(`${interaction.user} ${actionText} dla **${osadzony.imie} (${osadzony.id})**.`).setTimestamp());
        return;
    }

    // ==================================================
    // PRZYCISKI PRZEPUSTEK
    // ==================================================
    if (interaction.isButton() && interaction.customId.startsWith("przepustka_")) {
        if (!hasPermission(interaction)) return interaction.reply({ content: "❌ Tylko uprawnione osoby mogą rozpatrywać przepustki.", ephemeral: true });
        const match = /^przepustka_(zgoda|odmowa)_(.+)$/.exec(interaction.customId);
        if (!match) return interaction.reply({ content: "❌ Nieprawidłowy przycisk przepustki.", ephemeral: true });
        const deferred = typeof interaction.deferUpdate === "function" && typeof interaction.editReply === "function" && typeof interaction.followUp === "function";
        if (deferred) await interaction.deferUpdate();
        let request;
        try {
            request = decidePass(match[2], { decision: match[1] === "zgoda" ? "approve" : "reject" },
                { actor: interaction.user.id, role: "admin" });
        } catch (error) {
            const response = { content: `❌ ${error.message}`, ephemeral: true, allowedMentions: { parse: [] } };
            return deferred ? interaction.followUp(response) : interaction.reply(response);
        }
        management.recordDiscord("passes", request, interaction.user.id);
        await passNotifications.withRecordLock(request.id, () => {
            const current = getPass(request.id) || { ...request, status: "anulowana" };
            const payload = { embeds: [buildPassEmbed(current)], components: buildPassButtons(current), allowedMentions: { parse: [] } };
            return deferred ? interaction.editReply(payload) : interaction.update(payload);
        });
        const prisoner = getOsadzony(request.osadzonyId);
        if (prisoner) await refreshOsadzonyMessage(prisoner);
        await sendLog(interaction.guild, buildPassEmbed(request));
        return;
    }
});

return commands;
}

module.exports = { registerOsadzeniModule, stopTimers: () => { clearInterval(refreshTimer); refreshTimer = undefined; } };
