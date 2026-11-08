"use strict";

const path = require("node:path");
const crypto = require("node:crypto");
const storage = require("./storage");

const STATES = ["pending", "sending", "sent", "failed", "uncertain"];
const FIELDS = ["id", "osadzonyId", "osadzony", "od", "do", "powod", "miejsce", "status", "zlozyl", "utworzono", "rozpatrzyl", "rozpatrzono", "channelId", "messageId"];
const channelName = value => String(value || "").replace(/ł/g, "l").normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const definitive = error => [400, 401, 403, 404].includes(Number(error?.status)) ||
  [10003, 10008, 50001, 50013, 50035].includes(Number(error?.code));
const validId = value => typeof value === "string" && /^\d{17,20}$/.test(value);
const validReference = value => value && typeof value === "object" && !Array.isArray(value) && validId(value.channelId) && validId(value.messageId);

function assertChannel(client, channel, guildId, readHistory = false) {
  if (!channel || String(channel.guildId || channel.guild?.id || "") !== guildId ||
      ![0, 5].includes(channel.type) || !channel.isTextBased?.() || typeof channel.send !== "function") {
    throw new Error("Kanał przepustek musi być tekstowy i należeć do GUILD_ID. Sprawdź PASSES_CHANNEL_ID.");
  }
  const permissions = channel.permissionsFor?.(client.user);
  const required = ["ViewChannel", "SendMessages", "EmbedLinks", ...(readHistory ? ["ReadMessageHistory"] : [])];
  if (!permissions?.has(required)) throw new Error("Bot nie ma wymaganych uprawnień do kanału przepustek.");
  return channel;
}

async function resolvePassDestination(client, { guildId = process.env.GUILD_ID, channelId = process.env.PASSES_CHANNEL_ID, readHistory = false } = {}) {
  if (!validId(guildId)) throw new Error("Ustaw poprawne GUILD_ID dla przepustek.");
  const guild = client.guilds?.cache?.get(guildId) || await client.guilds?.fetch?.(guildId);
  if (!guild || String(guild.id) !== guildId) throw new Error("Bot nie ma dostępu do serwera przepustek.");
  let channel;
  if (channelId) {
    if (!validId(channelId)) throw new Error("Ustaw poprawne PASSES_CHANNEL_ID.");
    channel = guild.channels.cache?.get(channelId) || await guild.channels.fetch(channelId);
  } else {
    const channels = guild.channels.fetch ? await guild.channels.fetch() : guild.channels.cache;
    const matches = [...(channels?.values?.() || [])].filter(item => channelName(item?.name) === "przepustki" &&
      String(item.guildId || item.guild?.id || "") === guildId && [0, 5].includes(item.type) && item.isTextBased?.() && typeof item.send === "function");
    if (matches.length > 1) throw new Error("Kilka kanałów pasuje do przepustek. Ustaw PASSES_CHANNEL_ID.");
    [channel] = matches;
  }
  return assertChannel(client, channel, guildId, readHistory);
}

// A confirmed card checkpoint is never sent again. An interrupted POST remains
// uncertain even after restart, because Discord may have accepted the message.
function createPassNotifications({ client, getRecord = () => undefined, saveReference = () => {}, buildCard, buildButtons,
  refreshPrisoner = () => {}, dataDir = process.env.SW_DATA_DIR || path.join(__dirname, "..", "data"),
  guildId = () => process.env.GUILD_ID, channelId = () => process.env.PASSES_CHANNEL_ID, responseWaitMs = 750 } = {}) {
  client ||= { isReady: () => false, on() {}, removeListener() {} };
  const filename = path.join(dataDir, "pass-notifications.json");
  const db = storage.readJson(filename, { version: 1, events: [], refs: {} }, value =>
    value.version === 1 && Array.isArray(value.events) && value.refs && typeof value.refs === "object" && !Array.isArray(value.refs) &&
    Object.values(value.refs).every(validReference) &&
    value.events.every(event => event && typeof event.id === "string" && typeof event.recordId === "string" &&
      ["create", "update"].includes(event.action) && STATES.includes(event.state) && typeof event.actor === "string" &&
      typeof event.createdAt === "string" && event.snapshot && typeof event.snapshot === "object" && !Array.isArray(event.snapshot) &&
      event.steps && typeof event.steps === "object" && !Array.isArray(event.steps) &&
      Object.values(event.steps).every(step => step && STATES.includes(step.state) && (step.state !== "sent" || validReference(step.result)))));
  const persist = () => storage.writeJson(filename, db);
  let recovered = false;
  for (const event of db.events) {
    if (Object.values(event.steps).some(step => ["sending", "uncertain"].includes(step.state))) {
      event.state = "uncertain";
      event.error = "Wysyłka została przerwana. Sprawdź Discord; ponowienie jest zablokowane, aby uniknąć duplikatu.";
      recovered = true;
    } else if (event.state === "sending") { event.state = "pending"; recovered = true; }
  }
  if (recovered) persist();
  let running, active = false;
  const locks = new Map();
  async function withRecordLock(id, operation) {
    const previous = locks.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    locks.set(id, next);
    try { return await next; }
    finally { if (locks.get(id) === next) locks.delete(id); }
  }

  function outcome(event) {
    const status = event.state === "sent" ? "sent" : ["failed", "uncertain"].includes(event.state) ? "failed" : "pending";
    const message = status === "sent" ? "Zapisano wniosek i zaktualizowano kartę przepustki na Discordzie."
      : event.state === "uncertain" ? event.error
        : status === "failed" ? `Zapisano wniosek, ale karta przepustki wymaga uwagi. ${event.error || "Sprawdź kanał i uprawnienia bota."}`
          : event.blockedBy ? "Zapisano wniosek. Powiadomienie czeka na rozstrzygnięcie wcześniejszej wysyłki tej przepustki."
            : "Zapisano wniosek. Karta przepustki czeka na wysyłkę lub połączenie bota z Discordem.";
    return { id: event.id, resource: "passes", recordId: event.recordId, action: event.action, actor: event.actor,
      createdAt: event.createdAt, status, message, canRetry: ["pending", "failed"].includes(event.state) && !event.blockedBy };
  }

  function fail(event, state, message) {
    event.state = state; event.error = message;
    try { persist(); } catch (error) { console.error("Nie zapisano stanu kolejki przepustek:", error.message); }
  }

  async function write(event, name, operation, repeatable = false) {
    const step = event.steps[name] ||= { state: "pending" };
    if (step.state === "sent") return step.result;
    step.state = "sending"; event.state = "sending";
    try { persist(); }
    catch (error) {
      step.state = "failed";
      fail(event, "failed", "Nie udało się zapisać zamiaru wysyłki. Sprawdź dziennik bota.");
      throw error;
    }
    let result;
    try { result = await operation(); }
    catch (error) {
      step.state = repeatable || definitive(error) ? "failed" : "uncertain";
      fail(event, step.state, step.state === "uncertain"
        ? "Brak potwierdzenia wysyłki. Sprawdź Discord; ponowienie jest zablokowane, aby uniknąć duplikatu."
        : "Discord odrzucił operację. Sprawdź kanał i uprawnienia, a następnie ponów powiadomienie.");
      throw error;
    }
    step.state = "sent"; step.result = result;
    try { persist(); }
    catch (error) {
      step.state = "uncertain";
      fail(event, "uncertain", "Nie zapisano potwierdzenia operacji. Sprawdź Discord; ponowienie jest zablokowane, aby uniknąć duplikatu.");
      throw error;
    }
    return result;
  }

  const latest = event => getRecord(event.recordId) || { ...event.snapshot, status: "anulowana" };
  function payload(record) {
    record = { ...record };
    const buttons = record.status === "oczekuje" ? buildButtons(record) : [];
    return { embeds: [buildCard(record)], components: buttons ? (Array.isArray(buttons) ? buttons : [buttons]) : [], allowedMentions: { parse: [] } };
  }

  async function attempt(event) {
    if (event.state !== "pending" || !client.isReady?.()) return;
    await withRecordLock(event.recordId, async () => {
      if (event.state !== "pending" || !client.isReady?.()) return;
      try {
        const configuredGuild = String(guildId() || "");
        const destination = await resolvePassDestination(client, { guildId: configuredGuild, channelId: channelId() });
        if (!client.isReady?.()) return;
        const current = latest(event), saved = db.refs[event.recordId] || {};
        let reference = { channelId: current.channelId || saved.channelId || event.snapshot.channelId,
          messageId: current.messageId || saved.messageId || event.snapshot.messageId };
        const completed = Object.values(event.steps).filter(step => step.state === "sent").at(-1)?.result;
        if (completed) reference = { ...completed, renderedStatus: completed.renderedStatus || event.snapshot.status };
        async function findMessage(reference) {
          let cardChannel = destination, message;
          if (reference.messageId) {
            if (reference.channelId && reference.channelId !== destination.id) {
              const guild = client.guilds?.cache?.get(configuredGuild) || await client.guilds?.fetch?.(configuredGuild);
              cardChannel = guild.channels.cache?.get(reference.channelId) || await guild.channels.fetch(reference.channelId);
            }
            assertChannel(client, cardChannel, configuredGuild, true);
            try { message = await cardChannel.messages.fetch(reference.messageId); }
            catch (error) { if (Number(error.code) !== 10008) throw error; }
          }
          return { cardChannel, message };
        }
        async function renderCard(name, reference) {
          const { cardChannel, message } = await findMessage(reference);
          if (!client.isReady?.()) return;
          const rendered = { ...latest(event) }, outgoing = payload(rendered);
          if (message) {
            return write(event, name || "card-edit", async () => {
              await message.edit(outgoing);
              return { channelId: cardChannel.id, messageId: reference.messageId, renderedStatus: rendered.status };
            }, true);
          }
          const stepName = name || "card-create";
          return write(event, stepName, async () => {
            const sent = await destination.send({ ...outgoing,
              nonce: crypto.createHash("sha256").update(`pass:${event.id}:${stepName}`).digest("hex").slice(0, 25), enforceNonce: true });
            if (!validId(String(sent?.id || ""))) throw new Error("Discord nie potwierdził identyfikatora karty.");
            return { channelId: destination.id, messageId: String(sent.id), renderedStatus: rendered.status };
          });
        }
        if (!completed) reference = await renderCard(null, reference);
        if (!reference) return; // Disconnected while waiting to read the card.
        // A decision or deletion can occur while Discord acknowledges a write.
        // Recheck after all awaited callbacks and checkpoint each corrective edit.
        // The domain transitions only pending -> reviewed -> removed, so three
        // correction rounds also bound unexpected concurrent local mutations.
        for (let round = 0; round < 4; round++) {
          const canonicalReference = { channelId: reference.channelId, messageId: reference.messageId };
          db.refs[event.recordId] = canonicalReference;
          persist();
          await saveReference(event.recordId, canonicalReference);
          const record = latest(event);
          if (record.status === "zatwierdzona" && record.osadzonyId) {
            try { await refreshPrisoner(record.osadzonyId); }
            catch { console.error("Karta przepustki została zapisana; karta osadzonego zostanie odświeżona ponownie przez moduł."); }
          }
          if (latest(event).status === reference.renderedStatus) {
            event.state = "sent"; delete event.error; persist(); return;
          }
          if (round === 3) throw new Error("Stan przepustki zmieniał się podczas odświeżania karty.");
          const correction = Object.entries(event.steps).filter(([name, step]) => name.startsWith("card-reconcile-") && step.state === "sent").length;
          reference = await renderCard(`card-reconcile-${correction}`, reference);
          if (!reference) { event.state = "pending"; persist(); return; }
        }
      } catch (_) {
        if (!["failed", "uncertain"].includes(event.state)) fail(event, "failed", "Sprawdź GUILD_ID, PASSES_CHANNEL_ID oraz uprawnienia bota do kanału przepustek i historii wiadomości.");
      }
    });
  }

  async function drain() {
    if (running) return running;
    running = (async () => {
      const blocked = new Map();
      for (const event of db.events) {
        if (event.state === "pending" && blocked.has(event.recordId)) event.blockedBy = blocked.get(event.recordId);
        else { delete event.blockedBy; await attempt(event); }
        if (["failed", "uncertain"].includes(event.state)) blocked.set(event.recordId, event.id);
      }
    })();
    try { await running; } finally { running = undefined; }
  }
  async function settleBriefly() {
    const task = drain().catch(error => console.error("Kolejka przepustek:", error.message));
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, responseWaitMs);
      task.finally(() => { clearTimeout(timeout); resolve(); });
    });
  }
  async function enqueue(action, record, actor = "panel") {
    if (!["create", "update"].includes(action) || record?.id == null) throw new Error("Nieprawidłowe powiadomienie przepustki.");
    const snapshot = {};
    for (const name of FIELDS) if (typeof record[name] === "string") snapshot[name] = record[name].slice(0, name === "powod" ? 1000 : 200);
    snapshot.id = String(record.id).slice(0, 128);
    const event = { id: crypto.randomUUID(), recordId: snapshot.id, action, actor: String(actor).slice(0, 64),
      createdAt: new Date().toISOString(), state: "pending", snapshot, steps: {} };
    db.events.push(event);
    try { persist(); } catch (error) { db.events.splice(db.events.indexOf(event), 1); throw error; }
    await settleBriefly(); return outcome(event);
  }
  async function retry(id) {
    const event = db.events.find(item => item.id === id);
    if (!event) throw Object.assign(new Error("Nie znaleziono powiadomienia przepustki."), { status: 404 });
    if (["sending", "uncertain"].includes(event.state) || event.blockedBy) throw Object.assign(new Error("Najpierw sprawdź wcześniejszą wysyłkę na Discordzie. Ponowienie mogłoby utworzyć duplikat."), { status: 409 });
    if (event.state === "sent") return outcome(event);
    event.state = "pending"; delete event.error; persist();
    await settleBriefly(); return outcome(event);
  }
  const ready = () => { drain().catch(error => console.error("Kolejka przepustek:", error.message)); };
  return { enqueue, retry, withRecordLock, has: id => db.events.some(event => event.id === id),
    list: () => db.events.slice(-100).reverse().map(outcome),
    start() { if (active) return; active = true; client.on("ready", ready); client.on("shardResume", ready); if (client.isReady?.()) ready(); },
    async stop() {
      active = false; client.removeListener("ready", ready); client.removeListener("shardResume", ready);
      if (running) await running;
      if (locks.size) await Promise.allSettled([...locks.values()]);
    } };
}

module.exports = { createPassNotifications, resolvePassDestination };
