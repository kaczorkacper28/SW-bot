"use strict";

const path = require("node:path");
const crypto = require("node:crypto");
const { EmbedBuilder } = require("discord.js");
const storage = require("./storage");

const bound = (value, limit = 1024) => String(value ?? "Brak").slice(0, limit) || "Brak";
const channelName = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const definitive = error => [400, 401, 403, 404].includes(Number(error?.status)) || [10003, 10008, 50001, 50013, 50035].includes(Number(error?.code));
const nonce = (event, step) => crypto.createHash("sha256").update(`${event.id}:${step}`).digest("hex").slice(0, 25);

// Each Discord write is checkpointed before it starts. A crash or ambiguous transport
// error blocks retries: a message may already exist even without an HTTP response.
function createPrisonerNotifications({ client, getRecord, saveReference, buildCard, buildButtons,
  dataDir = process.env.SW_DATA_DIR || path.join(__dirname, "..", "data"),
  guildId = () => process.env.GUILD_ID, channelId = () => process.env.PRISONERS_CHANNEL_ID, responseWaitMs = 750 } = {}) {
  const filename = path.join(dataDir, "prisoner-notifications.json");
  const states = ["pending", "sending", "sent", "failed", "uncertain"];
  const db = storage.readJson(filename, { version: 1, events: [], refs: {} }, value =>
    value.version === 1 && Array.isArray(value.events) && value.refs && typeof value.refs === "object" && !Array.isArray(value.refs) &&
    value.events.every(event => event && typeof event.id === "string" && typeof event.recordId === "string" &&
      ["create", "update", "remove"].includes(event.action) && states.includes(event.state) && event.snapshot &&
      typeof event.snapshot === "object" && !Array.isArray(event.snapshot) && event.steps && typeof event.steps === "object" && !Array.isArray(event.steps) &&
      Object.values(event.steps).every(step => step && states.includes(step.state))));
  const persist = () => storage.writeJson(filename, db);
  let changed = false;
  for (const event of db.events) {
    if (Object.values(event.steps).some(step => step.state === "sending")) {
      event.state = "uncertain";
      event.error = "Wysyłka została przerwana. Sprawdź Discord; ponowna wysyłka jest zablokowana, aby uniknąć duplikatu.";
      changed = true;
    } else if (event.state === "sending") {
      // Every completed write has its result on disk; finish only the missing steps.
      event.state = "pending";
      changed = true;
    }
  }
  if (changed) persist();
  const locks = new Map();
  let running;
  let active = false;

  async function withRecordLock(id, operation) {
    const previous = locks.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    locks.set(id, next);
    try { return await next; }
    finally { if (locks.get(id) === next) locks.delete(id); }
  }

  function outcome(event) {
    const status = event.state === "sent" ? "sent" : ["failed", "uncertain"].includes(event.state) ? "failed" : "pending";
    const message = status === "sent" ? "Zapisano zmianę i opublikowano ją na Discordzie."
      : event.state === "uncertain" ? event.error
        : status === "pending" ? (event.blockedBy ? "Zapisano zmianę. Powiadomienie czeka na rozstrzygnięcie wcześniejszej wysyłki tego osadzonego."
          : event.state === "sending" ? "Zapisano zmianę. Powiadomienie jest wysyłane na Discord."
            : client.isReady?.() ? "Zapisano zmianę. Powiadomienie czeka w kolejce na wysyłkę."
              : "Zapisano zmianę. Powiadomienie czeka na połączenie bota z Discordem.")
          : `Zapisano zmianę, ale Discord nie został powiadomiony. ${event.error || "Sprawdź uprawnienia i ustawienia kanału."}`;
    return { id: event.id, status, message, canRetry: ["pending", "failed"].includes(event.state),
      action: event.action, recordId: event.recordId, actor: event.actor, createdAt: event.createdAt };
  }

  async function destination() {
    const configuredGuild = String(guildId() || "");
    if (!configuredGuild) throw new Error("Ustaw GUILD_ID serwera Discord.");
    const guild = client.guilds?.cache?.get(configuredGuild) || await client.guilds?.fetch?.(configuredGuild);
    if (!guild || String(guild.id) !== configuredGuild) throw new Error("Bot nie ma dostępu do skonfigurowanego serwera Discord.");
    const configuredChannel = String(channelId() || "");
    let channel;
    if (configuredChannel) channel = guild.channels.cache?.get(configuredChannel) || await guild.channels.fetch(configuredChannel);
    else {
      const channels = guild.channels.fetch ? await guild.channels.fetch() : guild.channels.cache;
      const matches = [...(channels?.values?.() || [])].filter(item => channelName(item?.name) === "osadzeni" &&
        [0, 5].includes(item.type) && item.isTextBased?.() && typeof item.send === "function");
      if (matches.length > 1) throw new Error("Kilka kanałów pasuje do osadzonych. Ustaw PRISONERS_CHANNEL_ID.");
      [channel] = matches;
    }
    if (!channel || String(channel.guildId || channel.guild?.id || "") !== configuredGuild ||
      !channel.isTextBased?.() || typeof channel.send !== "function" || ![0, 5].includes(channel.type)) {
      throw new Error("Nie znaleziono kanału tekstowego osadzeni na skonfigurowanym serwerze. Sprawdź PRISONERS_CHANNEL_ID.");
    }
    const permissions = channel.permissionsFor?.(client.user);
    if (permissions && !permissions.has(["ViewChannel", "SendMessages", "EmbedLinks"])) throw new Error("Bot potrzebuje uprawnień Wyświetlanie kanału, Wysyłanie wiadomości i Osadzanie linków.");
    return channel;
  }

  function reference(event) {
    const current = getRecord(event.recordId);
    const ref = db.refs[event.recordId] || {};
    return { channelId: current?.channelId || ref.channelId || event.snapshot.channelId,
      messageId: current?.messageId || ref.messageId || event.snapshot.messageId };
  }

  async function write(event, name, operation, { repeatable = false } = {}) {
    const step = event.steps[name] ||= { state: "pending" };
    if (step.state === "sent") return step.result;
    step.state = "sending";
    event.state = "sending";
    persist(); // Do not contact Discord unless the intent is durable.
    let result;
    try { result = await operation(); }
    catch (error) {
      step.state = repeatable || definitive(error) ? "failed" : "uncertain";
      event.state = step.state;
      event.error = step.state === "uncertain"
        ? "Brak potwierdzenia wysyłki. Sprawdź Discord; ponowna wysyłka jest zablokowana, aby uniknąć duplikatu."
        : "Discord odrzucił operację. Sprawdź kanał i uprawnienia bota, a następnie ponów powiadomienie.";
      persist();
      throw error;
    }
    step.result = result;
    step.state = "sent";
    // Keep event sending until all steps finish; restart must inspect completed steps.
    persist();
    return result;
  }

  function notice(event, deleted = false) {
    const labels = { create: "Dodano osadzonego", update: "Zmieniono osadzonego", remove: "Usunięto osadzonego" };
    return new EmbedBuilder().setTitle(`${deleted ? "🗑️" : "📋"} ${labels[event.action]}`)
      .setDescription(bound(`${event.snapshot.imie} (${event.recordId})`, 1000))
      .addFields({ name: "Operator panelu", value: bound(event.actor, 128) },
        { name: "Cela", value: bound(event.snapshot.cela, 100), inline: true },
        { name: "Paragraf", value: bound(event.snapshot.paragraf, 500), inline: true })
      .setFooter({ text: `Panel SW • ${event.id}` }).setTimestamp(new Date(event.createdAt));
  }

  async function processEvent(event) {
    if (event.state !== "pending" || !client?.isReady?.()) return;
    await withRecordLock(event.recordId, async () => {
      if (!client?.isReady?.()) return;
      let channel;
      try { channel = await destination(); }
      catch (_) {
        event.state = "failed";
        event.error = "Sprawdź GUILD_ID, PRISONERS_CHANNEL_ID i dostęp bota do kanału tekstowego osadzeni.";
        persist();
        return;
      }
      if (!client?.isReady?.()) return;
      try {
        let ref = reference(event);
        const completedCreate = event.steps["card-create"]?.state === "sent" ? event.steps["card-create"].result : null;
        const cardComplete = Boolean(completedCreate || event.steps["card-edit"]?.state === "sent");
        if (completedCreate) {
          ref = completedCreate;
          db.refs[event.recordId] = ref;
          persist();
        }
        let cardChannel = channel;
        if (!cardComplete && ref.channelId && ref.channelId !== channel.id) {
          cardChannel = channel.guild?.channels?.cache?.get(ref.channelId) || await channel.guild?.channels?.fetch?.(ref.channelId);
          if (!cardChannel || String(cardChannel.guildId || cardChannel.guild?.id) !== String(guildId()) || !cardChannel.isTextBased?.()) {
            throw new Error("Nieprawidłowy kanał zapisanej karty osadzonego.");
          }
        }
        let existingMessage;
        if (ref.messageId && !cardComplete) {
          try { existingMessage = await cardChannel.messages.fetch(ref.messageId); }
          catch (error) {
            if (Number(error.code) !== 10008) throw error;
            // Discord confirms that the old card no longer exists; replacement is safe.
            ref = {};
          }
        }
        if (ref.messageId) await saveReference(event.recordId, ref);
        const current = getRecord(event.recordId);
        if (!cardComplete && event.action !== "remove" && !ref.messageId) {
          const sent = await write(event, "card-create", async () => {
            const snapshot = { ...(current || event.snapshot) };
            const embed = buildCard(snapshot).addFields({ name: "Operator panelu", value: bound(event.actor, 128) });
            const message = await channel.send({ embeds: [embed], components: [buildButtons(snapshot)], allowedMentions: { parse: [] },
              nonce: nonce(event, "card-create"), enforceNonce: true });
            if (!/^\d{17,20}$/.test(String(message?.id || ""))) throw new Error("Discord nie potwierdził identyfikatora wiadomości.");
            return { channelId: channel.id, messageId: message.id };
          });
          db.refs[event.recordId] = sent;
          persist();
          await saveReference(event.recordId, sent);
          ref = sent;
          cardChannel = channel;
        } else if (!cardComplete && ref.messageId && event.action !== "create") {
          const message = existingMessage;
          // Message edits are idempotent; retrying a confirmed edit target cannot duplicate a message.
          await write(event, "card-edit", async () => {
            if (event.action === "remove") await message.edit({ embeds: [notice(event, true)], components: [], allowedMentions: { parse: [] } });
            else {
              const snapshot = { ...(getRecord(event.recordId) || event.snapshot) };
              await message.edit({ embeds: [buildCard(snapshot)], components: [buildButtons(snapshot)], allowedMentions: { parse: [] } });
            }
            return { channelId: cardChannel.id, messageId: ref.messageId };
          }, { repeatable: true });
        }
        if (event.action !== "create") {
          await write(event, "notice", async () => {
            const message = await channel.send({ embeds: [notice(event, event.action === "remove")], allowedMentions: { parse: [] },
              nonce: nonce(event, "notice"), enforceNonce: true });
            if (!/^\d{17,20}$/.test(String(message?.id || ""))) throw new Error("Discord nie potwierdził identyfikatora wiadomości.");
            return { channelId: channel.id, messageId: message.id };
          });
        }
        event.state = "sent";
        delete event.error;
        persist();
      } catch (_) {
        if (event.state === "sending") {
          event.state = "uncertain";
          event.error = "Nie zapisano potwierdzenia operacji. Sprawdź Discord; ponowna wysyłka jest zablokowana, aby uniknąć duplikatu.";
        } else if (!["failed", "uncertain"].includes(event.state)) {
          event.state = "failed";
          event.error = "Nie udało się odświeżyć karty. Sprawdź wiadomość i dostęp bota do kanału.";
        }
        try { persist(); } catch (error) { console.error("Nie zapisano stanu powiadomienia Discord:", error.message); }
      }
    });
  }

  async function drain() {
    if (running) return running;
    running = (async () => {
      const blocked = new Map();
      for (const event of db.events) {
        // An earlier ambiguous create must not cause a later edit to create another card.
        if (blocked.has(event.recordId) && event.state === "pending") event.blockedBy = blocked.get(event.recordId);
        else { delete event.blockedBy; await processEvent(event); }
        if (["failed", "uncertain"].includes(event.state)) blocked.set(event.recordId, event.id);
      }
    })();
    try { await running; }
    finally { running = undefined; }
  }

  async function enqueue(action, record, actor = "panel") {
    const event = { id: crypto.randomUUID(), recordId: String(record.id), action, snapshot: structuredClone(record),
      actor: bound(actor, 64), createdAt: new Date().toISOString(), state: "pending", steps: {} };
    db.events.push(event);
    try { persist(); }
    catch (error) { db.events.splice(db.events.indexOf(event), 1); throw error; }
    await settleBriefly();
    return outcome(event);
  }

  async function retry(id) {
    const event = db.events.find(item => item.id === id);
    if (!event) throw Object.assign(new Error("Nie znaleziono powiadomienia."), { status: 404 });
    if (["sending", "uncertain"].includes(event.state)) throw Object.assign(new Error("Najpierw sprawdź wynik operacji na Discordzie. Ponowienie mogłoby utworzyć duplikat."), { status: 409 });
    if (event.state === "sent") return outcome(event);
    event.state = "pending";
    delete event.error;
    persist();
    await settleBriefly();
    return outcome(event);
  }
  async function settleBriefly() {
    const task = drain().catch(error => console.error("Kolejka powiadomień Discord:", error.message));
    // Discord rate limits and REST retries may outlast the panel's HTTP timeout.
    // A successful database mutation must still return its saved/pending result.
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, responseWaitMs);
      task.finally(() => { clearTimeout(timeout); resolve(); });
    });
  }
  const ready = () => { drain().catch(error => console.error("Kolejka powiadomień Discord:", error.message)); };
  return { enqueue, retry, list: () => db.events.slice(-100).reverse().map(outcome), withRecordLock,
    start() { if (active) return; active = true; client.on("ready", ready); client.on("shardResume", ready); if (client.isReady?.()) ready(); },
    async stop() { active = false; client.removeListener("ready", ready); client.removeListener("shardResume", ready); if (running) await running; } };
}

module.exports = { createPrisonerNotifications };
