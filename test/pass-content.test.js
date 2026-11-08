"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ButtonStyle } = require("discord.js");
const { buildPassEmbed, buildPassButtons } = require("../services/pass-content");

const created = "2026-11-08T10:00:00.000Z";
const reviewed = "2026-11-08T10:15:00.000Z";
const creatorId = "100000000000000441";
const reviewerId = "100000000000000442";
const sample = () => ({ id: "P-001", osadzonyId: "O-001", osadzony: "Jan Testowy", od: "11:30", do: "12:30",
  powod: "Wizyta kontrolna u lekarza", miejsce: "Przychodnia", status: "oczekuje", zlozyl: creatorId, utworzono: created });
const fields = embed => Object.fromEntries(embed.fields.map(field => [field.name, field.value]));

test("pending pass card contains complete request data and existing approval button IDs", () => {
  const record = sample();
  const embed = buildPassEmbed(record).toJSON();
  assert.equal(embed.title, "🎫 WNIOSEK O PRZEPUSTKĘ");
  assert.equal(embed.color, 0xe0ab39);
  assert.match(embed.description, /Jan Testowy/);
  assert.match(embed.description, /O-001/);
  const rendered = fields(embed);
  assert.equal(rendered["🎫 Numer wniosku"], "P-001");
  assert.equal(rendered["🕐 Od"], "11:30");
  assert.equal(rendered["🕐 Do"], "12:30");
  assert.equal(rendered["📍 Miejsce"], "Przychodnia");
  assert.equal(rendered["📝 Powód"], "Wizyta kontrolna u lekarza");
  assert.equal(rendered["🟡 Status"], "Oczekuje na decyzję");
  assert.equal(rendered["👮 Złożył"], `<@${creatorId}>`);
  assert.match(rendered["📅 Złożono"], /08\.11\.2026/);
  assert.match(rendered["📅 Złożono"], /11:00/);
  assert.equal(embed.timestamp, created);
  assert.equal(embed.footer.text, "Służba Więzienna • Rejestr przepustek");
  const components = buildPassButtons(record).map(row => row.toJSON());
  assert.equal(components.length, 1);
  assert.deepEqual(components[0].components.map(button => button.custom_id), ["przepustka_zgoda_P-001", "przepustka_odmowa_P-001"]);
  assert.deepEqual(components[0].components.map(button => button.style), [ButtonStyle.Success, ButtonStyle.Danger]);
});

test("approved and rejected cards retain request details and show the recorded reviewer and date", () => {
  for (const [status, title, color, reviewerField] of [
    ["zatwierdzona", "✅ PRZEPUSTKA ZATWIERDZONA", 0x269563, "👮 Zatwierdził"],
    ["odrzucona", "❌ PRZEPUSTKA ODRZUCONA", 0xb84444, "👮 Odrzucił"],
  ]) {
    const record = { ...sample(), status, rozpatrzyl: reviewerId, rozpatrzono: reviewed };
    const embed = buildPassEmbed(record).toJSON();
    const rendered = fields(embed);
    assert.equal(embed.title, title);
    assert.equal(embed.color, color);
    assert.equal(rendered["📝 Powód"], sample().powod);
    assert.equal(rendered["📍 Miejsce"], sample().miejsce);
    assert.equal(rendered[reviewerField], `<@${reviewerId}>`);
    assert.match(rendered["📅 Data decyzji"], /11:15/);
    assert.equal(embed.timestamp, reviewed);
    assert.deepEqual(buildPassButtons(record), []);
  }
});

test("legacy missing fields remain missing and unknown states never acquire approval buttons", () => {
  for (const record of [undefined, null, {}, { id: "P-001" }, { id: "P-001", status: "nieznany" }]) {
    const embed = buildPassEmbed(record).toJSON();
    assert.match(embed.description, /Brak danych/);
    assert.ok(embed.fields.filter(field => field.name !== "🎫 Numer wniosku").every(field => field.value === "Brak danych"));
    assert.equal(fields(embed)["🎫 Numer wniosku"], record?.id || "Brak danych");
    assert.equal(embed.timestamp, undefined);
    assert.deepEqual(buildPassButtons(record), []);
  }
  const legacy = buildPassEmbed({ id: "P-002", status: "zatwierdzona", zlozyl: "operator.panel" }).toJSON();
  assert.equal(fields(legacy)["👮 Złożył"], "operator.panel");
  assert.equal(fields(legacy)["👮 Zatwierdził"], "Brak danych");
  assert.equal(fields(legacy)["📅 Data decyzji"], undefined);
  assert.equal(legacy.timestamp, undefined);
});

test("removed pass snapshots show a cancelled card with no actionable decision buttons", () => {
  const record = { ...sample(), status: "anulowana" };
  const embed = buildPassEmbed(record).toJSON();
  assert.equal(embed.title, "🎫 PRZEPUSTKA ANULOWANA");
  assert.equal(embed.color, 0x667788);
  assert.equal(fields(embed)["⚪ Status"], "Anulowana");
  assert.equal(fields(embed)["📝 Powód"], sample().powod);
  assert.equal(fields(embed)["📍 Miejsce"], sample().miejsce);
  assert.match(embed.description, /O-001/);
  assert.deepEqual(buildPassButtons(record), []);
});

test("bounded known primitive fields fit Discord limits and never coerce private objects", () => {
  const sentinel = "DO_NOT_RENDER_PRIVATE_SENTINEL";
  const unsafe = { toString() { throw new Error("unexpected object coercion"); } };
  const embed = buildPassEmbed({ ...sample(), osadzony: "n".repeat(5000), osadzonyId: "i".repeat(5000),
    powod: "p".repeat(10000), miejsce: "m".repeat(10000), status: unsafe, zlozyl: unsafe,
    utworzono: unsafe, password: sentinel, token: sentinel, internal: { credential: sentinel } }).toJSON();
  assert.ok(!JSON.stringify(embed).includes(sentinel));
  assert.ok(embed.title.length <= 256 && embed.description.length <= 4096);
  assert.ok(embed.fields.every(field => field.name.length <= 256 && field.value.length >= 1 && field.value.length <= 1024));
  const length = [embed.title, embed.description, embed.footer.text, ...embed.fields.flatMap(field => [field.name, field.value])]
    .reduce((sum, value) => sum + value.length, 0);
  assert.ok(length <= 6000);
  assert.equal(fields(embed)["👮 Złożył"], "Brak danych");
  assert.equal(fields(embed)["Status"], "Brak danych");
});

test("only valid persistent pass IDs produce buttons and every custom ID fits Discord", () => {
  for (const id of [undefined, "", "O-001", "P-1", "P-001_bad", "P-" + "1".repeat(100)]) {
    assert.deepEqual(buildPassButtons({ id, status: "oczekuje" }), []);
  }
  for (const id of ["P-001", "P-1000", "P-" + "1".repeat(78)]) {
    for (const row of buildPassButtons({ id, status: "oczekuje" })) {
      for (const button of row.toJSON().components) assert.ok(button.custom_id.length <= 100);
    }
  }
});

test("renderer accepts an explicit timestamp, ignores invalid stored dates, and leaves the record untouched", () => {
  const record = Object.freeze({ ...sample(), utworzono: "dawny zapis daty" });
  const before = JSON.stringify(record);
  const timestamp = new Date(reviewed);
  const embed = buildPassEmbed(record, { timestamp }).toJSON();
  assert.equal(embed.timestamp, reviewed);
  assert.equal(fields(embed)["📅 Złożono"], "dawny zapis daty");
  assert.equal(buildPassEmbed(record).toJSON().timestamp, undefined);
  assert.equal(JSON.stringify(record), before);
  buildPassButtons(record);
  assert.equal(JSON.stringify(record), before);
});
