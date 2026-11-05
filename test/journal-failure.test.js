"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");

test("a confirmed proposal is not reported as failed when its local journal cannot be written", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sw-journal-failure-"));
  process.env.SW_DATA_DIR = directory;
  process.env.MANAGEMENT_DATA_DIR = directory;
  const client = new EventEmitter();
  const { registerPropozycjeModule } = require("../modules/propozycje");
  registerPropozycjeModule(client);
  const replies = [];
  let sent = 0;
  const channel = {
    id: "100000000000000123", name: "┃propozycje", isTextBased: () => true,
    async send() { sent++; return { id: "100000000000000124", react: async () => {} }; }
  };
  const interaction = {
    isChatInputCommand: () => false, isButton: () => false, isModalSubmit: () => true,
    customId: "sw_proposal_modal", user: { id: "100000000000000125", toString: () => "Testowy funkcjonariusz" },
    guild: { channels: { cache: { find: () => channel } } },
    fields: { getTextInputValue: () => "Propozycja testowa" },
    reply: async value => replies.push(value),
  };
  const originalRename = fs.renameSync;
  const originalError = console.error;
  let warned = false;
  try {
    fs.renameSync = () => { throw new Error("Simulated disk write failure"); };
    console.error = () => { warned = true; };
    await client.listeners("interactionCreate")[0](interaction);
    assert.equal(sent, 1);
    assert.equal(replies.length, 1);
    assert.match(replies[0].content, /została dodana/);
    assert.equal(warned, true);
  } finally {
    fs.renameSync = originalRename;
    console.error = originalError;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
