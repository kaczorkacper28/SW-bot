"use strict";

const path = require("node:path");
const crypto = require("node:crypto");
const storage = require("./storage");
const { NotificationConfigurationError, notificationConfigurationDiagnostic } = require("./notification-content");

const FIELDS = {
  members: ["userId", "name", "number", "rank", "corps", "plus", "minus", "reprimands"],
  ranks: ["userId", "section", "number"],
  reports: ["title", "author", "authorId", "date", "hours", "place", "serviceType", "content", "status"],
  calls: ["title", "target", "name", "userId", "reason", "content", "deadline", "status"],
  documents: ["title", "kind", "content", "status"],
  proposals: ["title", "author", "authorId", "content", "status"],
  payouts: ["title", "recipient", "userId", "amount", "reason", "content", "status"],
};
const STATES = ["pending", "sending", "sent", "failed", "uncertain"];
const definitive = error => [400, 401, 403, 404].includes(Number(error?.status)) ||
  [10003, 50001, 50013, 50035].includes(Number(error?.code));

// These are change announcements only. Message IDs belong to this outbox, never
// to a report/proposal's separate, explicit full-publication state.
function createResourceNotifications({ client, getFallbackChannelId = () => undefined,
  dataDir = process.env.MANAGEMENT_DATA_DIR || process.env.SW_DATA_DIR || path.join(__dirname, "..", "data"),
  responseWaitMs = 750, resolveDestination, buildNotice } = {}) {
  client ||= { isReady: () => false, on() {}, removeListener() {} };
  const content = (!resolveDestination || !buildNotice) ? require("./notification-content") : {};
  resolveDestination ||= content.resolveDestination;
  buildNotice ||= content.buildNotice;
  const filename = path.join(dataDir, "resource-notifications.json");
  const db = storage.readJson(filename, { version: 1, events: [] }, value => value.version === 1 && Array.isArray(value.events) &&
    value.events.every(event => event && typeof event.id === "string" && Object.hasOwn(FIELDS, event.resource) &&
      typeof event.recordId === "string" && ["create", "update", "remove"].includes(event.action) && STATES.includes(event.state) &&
      typeof event.actor === "string" && typeof event.createdAt === "string" && event.snapshot &&
      typeof event.snapshot === "object" && !Array.isArray(event.snapshot)));
  const persist = () => storage.writeJson(filename, db);
  let recovered = false;
  for (const event of db.events) {
    if (event.state === "sending") {
      event.state = "uncertain";
      event.error = "Wysyłka została przerwana. Sprawdź Discord; ponowienie jest zablokowane, aby uniknąć duplikatu.";
      recovered = true;
    }
  }
  if (recovered) persist();
  let running;
  let active = false;

  function outcome(event) {
    const status = event.state === "sent" ? "sent" : ["failed", "uncertain"].includes(event.state) ? "failed" : "pending";
    const message = status === "sent" ? "Zapisano zmianę i wysłano powiadomienie na Discord."
      : event.state === "uncertain" ? event.error
        : status === "failed" ? `Zapisano zmianę, ale powiadomienie Discord nie zostało wysłane. ${event.error || "Sprawdź kanał i uprawnienia bota."}`
          : event.blockedBy ? "Zapisano zmianę. Powiadomienie czeka na rozstrzygnięcie wcześniejszej wysyłki tego wpisu."
            : event.state === "sending" ? "Zapisano zmianę. Wysyłka do Discorda jest w toku."
              : client.isReady?.() ? "Zapisano zmianę. Powiadomienie czeka w kolejce na wysyłkę."
                : "Zapisano zmianę. Powiadomienie czeka na połączenie bota z Discordem.";
    const diagnostic = event.state === "failed" ? notificationConfigurationDiagnostic(event.diagnostic) : undefined;
    return { id: event.id, resource: event.resource, recordId: event.recordId, action: event.action,
      actor: event.actor, createdAt: event.createdAt, status, message,
      ...(diagnostic?.resource === event.resource ? { diagnostic } : {}),
      canRetry: ["pending", "failed"].includes(event.state) && !event.blockedBy };
  }

  function saveFailure(event, error) {
    try { persist(); }
    catch (failure) { console.error("Nie zapisano stanu powiadomienia Discord:", failure.message); }
  }

  async function attempt(event) {
    if (event.state !== "pending" || !client.isReady?.()) return;
    let channel;
    let payload;
    try {
      channel = await resolveDestination(client, event.resource, { fallbackChannelId: getFallbackChannelId(event.resource) });
      payload = { embeds: [buildNotice(event)], allowedMentions: { parse: [] },
        nonce: crypto.createHash("sha256").update(`panel-notice:${event.id}`).digest("hex").slice(0, 25), enforceNonce: true };
    } catch (error) {
      event.state = "failed";
      if (error instanceof NotificationConfigurationError && error.resource === event.resource) {
        event.error = error.message;
        event.diagnostic = notificationConfigurationDiagnostic(error);
      } else {
        event.error = "Sprawdź konfigurację kanału tego modułu oraz dostęp i uprawnienia bota na serwerze Discord.";
        delete event.diagnostic;
      }
      saveFailure(event, error);
      return;
    }
    if (!client.isReady?.()) return;
    delete event.diagnostic;
    event.state = "sending";
    try { persist(); }
    catch (error) {
      // No network write has started. A disk failure must not produce an untracked send.
      event.state = "failed";
      event.error = "Nie udało się zapisać kolejki wysyłki. Sprawdź dziennik bota.";
      saveFailure(event, error);
      return;
    }
    let message;
    try {
      message = await channel.send(payload);
      if (!/^\d{17,20}$/.test(String(message?.id || ""))) throw new Error("Brak potwierdzonego identyfikatora wiadomości.");
    } catch (error) {
      event.state = definitive(error) ? "failed" : "uncertain";
      event.error = event.state === "uncertain"
        ? "Brak potwierdzenia wysyłki. Sprawdź Discord; ponowienie jest zablokowane, aby uniknąć duplikatu."
        : "Discord odrzucił wiadomość. Sprawdź kanał i uprawnienia bota, a następnie ponów powiadomienie.";
      saveFailure(event, error);
      return;
    }
    event.channelId = channel.id;
    event.discordMessageId = message.id;
    event.state = "sent";
    delete event.error;
    delete event.diagnostic;
    try { persist(); }
    catch (error) {
      // The remote write succeeded, so repeating it after a failed checkpoint is unsafe.
      event.state = "uncertain";
      event.error = "Nie zapisano potwierdzenia wysyłki. Sprawdź Discord; ponowienie jest zablokowane, aby uniknąć duplikatu.";
      saveFailure(event, error);
    }
  }

  async function drain() {
    if (running) return running;
    running = (async () => {
      const blocked = new Map();
      for (const event of db.events) {
        const key = `${event.resource}:${event.recordId}`;
        if (blocked.has(key) && event.state === "pending") event.blockedBy = blocked.get(key);
        else { delete event.blockedBy; await attempt(event); }
        if (["failed", "uncertain"].includes(event.state)) blocked.set(key, event.id);
      }
    })();
    try { await running; }
    finally { running = undefined; }
  }

  async function settleBriefly() {
    const task = drain().catch(error => console.error("Kolejka powiadomień Discord:", error.message));
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, responseWaitMs);
      task.finally(() => { clearTimeout(timeout); resolve(); });
    });
  }

  async function enqueue(resource, action, record, actor = "panel") {
    if (!Object.hasOwn(FIELDS, resource) || !["create", "update", "remove"].includes(action) || record?.id == null) {
      throw new Error("Nieprawidłowe powiadomienie modułu.");
    }
    const snapshot = { id: String(record.id).slice(0, 128) };
    for (const key of FIELDS[resource]) {
      const value = record[key];
      if (typeof value === "string") snapshot[key] = value.slice(0, 500);
      else if (typeof value === "number" && Number.isFinite(value)) snapshot[key] = value;
      else if (typeof value === "boolean") snapshot[key] = value;
    }
    const event = { id: crypto.randomUUID(), resource, action, recordId: snapshot.id, snapshot,
      actor: String(actor).slice(0, 64), createdAt: new Date().toISOString(), state: "pending" };
    db.events.push(event);
    try { persist(); }
    catch (error) { db.events.splice(db.events.indexOf(event), 1); throw error; }
    await settleBriefly();
    return outcome(event);
  }

  async function retry(id) {
    const event = db.events.find(item => item.id === id);
    if (!event) throw Object.assign(new Error("Nie znaleziono powiadomienia."), { status: 404 });
    if (["sending", "uncertain"].includes(event.state)) throw Object.assign(new Error("Najpierw sprawdź Discord. Ponowienie mogłoby utworzyć duplikat."), { status: 409 });
    if (event.state === "sent") return outcome(event);
    event.state = "pending";
    delete event.error;
    delete event.diagnostic;
    persist();
    await settleBriefly();
    return outcome(event);
  }

  const ready = () => { drain().catch(error => console.error("Kolejka powiadomień Discord:", error.message)); };
  return { enqueue, retry, has: id => db.events.some(event => event.id === id),
    list: () => db.events.slice(-100).reverse().map(outcome),
    start() { if (active) return; active = true; client.on("ready", ready); client.on("shardResume", ready); if (client.isReady?.()) ready(); },
    async stop() { active = false; client.removeListener("ready", ready); client.removeListener("shardResume", ready); if (running) await running; } };
}

module.exports = { createResourceNotifications };
