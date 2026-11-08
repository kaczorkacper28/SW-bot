"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Collection, EmbedBuilder } = require("discord.js");
const { resolveDestination, buildNotice, NotificationConfigurationError, notificationConfigurationDiagnostic } = require("../services/notification-content");

const guildId = "100000000000000001";
const foreignGuildId = "100000000000000002";
const channelId = "100000000000000010";
const resources = ["members", "ranks", "reports", "calls", "documents", "proposals", "payouts"];

function channel({ id = channelId, name = "custom", owner = guildId, type = 0, permitted = true } = {}) {
  return {
    id, name, guildId:owner, guild:{ id:owner }, type,
    isTextBased:() => true, send:async() => { throw new Error("Tests never send Discord messages"); },
    permissionsFor:() => ({ has:() => permitted })
  };
}

function clientFor(channels) {
  const cache = new Collection(channels.map(item => [item.id,item]));
  const guild = { id:guildId, channels:{ cache, fetch:async id => id ? cache.get(id) : cache } };
  return {
    user:{ id:"100000000000000099" },
    channels:{ cache, fetch:async id => cache.get(id) },
    guilds:{ cache:new Collection([[guildId,guild]]), fetch:async id => {
      assert.equal(id,guildId);
      return guild;
    } }
  };
}

const envFor = values => ({ GUILD_ID:guildId, ...values });

test("each resource's explicit panel channel takes priority over fallback, legacy and aliases",async() => {
  for (const resource of resources) {
    const explicit = channel({ id:"100000000000000011" });
    const fallback = channel({ id:"100000000000000012" });
    const legacy = channel({ id:"100000000000000013",name:"raporty" });
    const env = envFor({ [`PANEL_${resource.toUpperCase()}_CHANNEL_ID`]:explicit.id, REPORT_CHANNEL_ID:legacy.id, CALL_CHANNEL_ID:legacy.id, PROPOSALS_CHANNEL_ID:legacy.id, LOG_CHANNEL_ID:legacy.id });
    assert.equal(await resolveDestination(clientFor([explicit,fallback,legacy]),resource,{ env,fallbackChannelId:fallback.id }),explicit,resource);
  }
});

test("fallback channel precedes legacy configuration, while legacy precedes name aliases",async() => {
  const legacyVariables = { reports:"REPORT_CHANNEL_ID", calls:"CALL_CHANNEL_ID", proposals:"PROPOSALS_CHANNEL_ID", payouts:"LOG_CHANNEL_ID" };
  const aliases = { reports:"raporty", calls:"wezwania", proposals:"propozycje", payouts:"wyplaty" };
  for (const [resource,variable] of Object.entries(legacyVariables)) {
    const fallback = channel({ id:"100000000000000020" });
    const legacy = channel({ id:"100000000000000021" });
    const alias = channel({ id:"100000000000000022",name:aliases[resource] });
    const client = clientFor([fallback,legacy,alias]);
    const env = envFor({ [variable]:legacy.id });
    assert.equal(await resolveDestination(client,resource,{ env,fallbackChannelId:fallback.id }),fallback);
    assert.equal(await resolveDestination(client,resource,{ env }),legacy);
  }
});

test("Polish channel names, decorative punctuation and case normalize to documented resource aliases",async() => {
  const aliases = {
    members:"👮 FUNKCJONARIUSZE", ranks:"🎖️ Lista SW", reports:"📋 Raporty Służbowe", calls:"📞 Wezwania",
    documents:"📄 Dokumenty", proposals:"💡 PROPOZYCJE", payouts:"💰 WY-PŁA-TY"
  };
  for (const [resource,name] of Object.entries(aliases)) {
    const item = channel({ name });
    assert.equal(await resolveDestination(clientFor([item]),resource,{ env:envFor({}) }),item,resource);
  }
  for (const [resource,name] of [["members","KADRY"],["ranks","Stopnie"]]) {
    const item = channel({ name,type:5 });
    assert.equal(await resolveDestination(clientFor([item]),resource,{ env:envFor({}) }),item,resource);
  }
});

test("configured missing, invalid or foreign channels reject without falling back to another destination",async() => {
  const alias = channel({ id:"100000000000000030",name:"raporty" });
  const foreign = channel({ id:"100000000000000031",owner:foreignGuildId });
  const denied = channel({ id:"100000000000000032",permitted:false });
  const client = clientFor([alias,foreign,denied]);
  for (const selected of ["bad-id", "100000000000000033", foreign.id, denied.id]) {
    await assert.rejects(resolveDestination(client,"reports",{ env:envFor({ PANEL_REPORTS_CHANNEL_ID:selected }),fallbackChannelId:alias.id }));
    await assert.rejects(resolveDestination(client,"reports",{ env:envFor({ REPORT_CHANNEL_ID:selected }) }));
    await assert.rejects(resolveDestination(client,"reports",{ env:envFor({ REPORT_CHANNEL_ID:alias.id }),fallbackChannelId:selected }));
  }
});

test("every destination path requires a valid configured guild and the channel's ownership",async() => {
  const own = channel({ name:"raporty" });
  const foreign = channel({ name:"raporty",owner:foreignGuildId });
  for (const guild of [undefined,"", "123", "not-a-guild"]) {
    await assert.rejects(resolveDestination(clientFor([own]),"reports",{ env:{ GUILD_ID:guild, PANEL_REPORTS_CHANNEL_ID:own.id } }));
  }
  await assert.rejects(resolveDestination(clientFor([foreign]),"reports",{ env:envFor({}) }));
});

test("missing channel permissions, embed permission or non-text types reject",async() => {
  const noPermissions = channel();
  noPermissions.permissionsFor = () => null;
  const noPermissionMethod = channel();
  noPermissionMethod.permissionsFor = () => ({});
  const noPermissionLookup = channel();
  delete noPermissionLookup.permissionsFor;
  const deniedEmbeds = channel();
  deniedEmbeds.permissionsFor = () => ({ has:permissions => !permissions.includes("EmbedLinks") });
  const noSend = channel();
  delete noSend.send;
  const nonText = channel({ type:2 });
  const falseText = channel();
  falseText.isTextBased = () => false;
  for (const item of [noPermissions,noPermissionMethod,noPermissionLookup,deniedEmbeds,noSend,nonText,falseText]) {
    await assert.rejects(resolveDestination(clientFor([item]),"reports",{ env:envFor({ PANEL_REPORTS_CHANNEL_ID:item.id }) }));
  }
});

test("ambiguous aliases reject even if only one matching channel has permission",async() => {
  const first = channel({ id:"100000000000000041",name:"raporty" });
  const second = channel({ id:"100000000000000042",name:"Raporty Służbowe",permitted:false });
  const client = clientFor([first,second]);
  await assert.rejects(resolveDestination(client,"reports",{ env:envFor({}) }));
  assert.equal(await resolveDestination(client,"reports",{ env:envFor({ PANEL_REPORTS_CHANNEL_ID:first.id }) }),first);
});

function diagnostic(code, setting, resource, message) {
  return error => {
    assert.ok(error instanceof NotificationConfigurationError);
    assert.equal(error.name,"NotificationConfigurationError");
    assert.equal(error.code,code);
    assert.equal(error.setting,setting);
    assert.equal(error.resource,resource);
    if (message) assert.match(error.message,message);
    assert.ok(!error.message.includes(channelId));
    assert.ok(!error.message.includes(guildId));
    return true;
  };
}

test("member destination errors give the log-channel command only when an explicit panel setting does not override it",async() => {
  await assert.rejects(resolveDestination(clientFor([]),"members",{ env:envFor({}) }),error => {
    diagnostic("CHANNEL_MISSING","PANEL_MEMBERS_CHANNEL_ID","members",/\/sw-ustaw-logi/)(error);
    assert.match(error.message,/kadry/);
    assert.match(error.message,/funkcjonariusze/);
    return true;
  });
  await assert.rejects(resolveDestination(clientFor([]),"members",{ env:envFor({}),fallbackChannelId:"invalid-saved-channel" }),
    diagnostic("INVALID_CHANNEL_ID","PANEL_MEMBERS_CHANNEL_ID","members",/\/sw-ustaw-logi/));
  const alias = channel({ name:"kadry" });
  await assert.rejects(resolveDestination(clientFor([alias]),"members",{
    env:envFor({ PANEL_MEMBERS_CHANNEL_ID:"PRIVATE_ENV_VALUE_MUST_NOT_APPEAR" }),fallbackChannelId:alias.id,
  }),error => {
    diagnostic("INVALID_CHANNEL_ID","PANEL_MEMBERS_CHANNEL_ID","members",/PANEL_MEMBERS_CHANNEL_ID/)(error);
    assert.doesNotMatch(error.message,/sw-ustaw-logi|PRIVATE_ENV_VALUE_MUST_NOT_APPEAR/);
    return true;
  });
});

test("typed diagnostics distinguish guild access, missing configured channels, wrong ownership and unsupported channel type",async() => {
  await assert.rejects(resolveDestination(clientFor([]),"reports",{ env:{ GUILD_ID:"invalid" } }),
    diagnostic("INVALID_GUILD_ID","GUILD_ID","reports",/GUILD_ID/));
  const unavailable = clientFor([]);
  unavailable.guilds.cache.clear();
  unavailable.guilds.fetch = async() => null;
  await assert.rejects(resolveDestination(unavailable,"reports",{ env:envFor({}) }),
    diagnostic("GUILD_UNAVAILABLE","GUILD_ID","reports",/dostępu/));
  await assert.rejects(resolveDestination(clientFor([]),"reports",{ env:envFor({ PANEL_REPORTS_CHANNEL_ID:channelId }) }),
    diagnostic("CHANNEL_UNAVAILABLE","PANEL_REPORTS_CHANNEL_ID","reports",/odczytać wskazanego kanału/));
  await assert.rejects(resolveDestination(clientFor([channel({ owner:foreignGuildId })]),"reports",{ env:envFor({ PANEL_REPORTS_CHANNEL_ID:channelId }) }),
    diagnostic("CHANNEL_WRONG_GUILD","PANEL_REPORTS_CHANNEL_ID","reports",/innego serwera/));
  await assert.rejects(resolveDestination(clientFor([channel({ type:2 })]),"reports",{ env:envFor({ PANEL_REPORTS_CHANNEL_ID:channelId }) }),
    diagnostic("CHANNEL_NOT_TEXT","PANEL_REPORTS_CHANNEL_ID","reports",/wiadomości tekstowych/));
  await assert.rejects(resolveDestination(clientFor([]),"reports",{ env:envFor({ REPORT_CHANNEL_ID:"invalid" }) }),
    diagnostic("INVALID_CHANNEL_ID","REPORT_CHANNEL_ID","reports",/REPORT_CHANNEL_ID/));
});

test("alias diagnostics list only the known normalized names and require an unambiguous channel setting",async() => {
  await assert.rejects(resolveDestination(clientFor([]),"reports",{ env:envFor({}) }),
    diagnostic("CHANNEL_MISSING","PANEL_REPORTS_CHANNEL_ID","reports",/raporty, raportysluzbowe/));
  const matches = [channel({ name:"raporty" }),channel({ id:"100000000000000071",name:"raporty służbowe" })];
  await assert.rejects(resolveDestination(clientFor(matches),"reports",{ env:envFor({}) }),
    diagnostic("CHANNEL_AMBIGUOUS","PANEL_REPORTS_CHANNEL_ID","reports",/jednoznaczny.*PANEL_REPORTS_CHANNEL_ID/));
});

test("permission diagnostics name each missing permission and distinguish an unavailable permission lookup",async() => {
  const labels = { ViewChannel:"Wyświetlanie kanału",SendMessages:"Wysyłanie wiadomości",EmbedLinks:"Osadzanie linków" };
  for (const [missing,label] of Object.entries(labels)) {
    const item = channel();
    const checked = [];
    item.permissionsFor = () => ({ has:permissions => { checked.push(permissions); return !permissions.includes(missing); } });
    await assert.rejects(resolveDestination(clientFor([item]),"members",{ env:envFor({ PANEL_MEMBERS_CHANNEL_ID:item.id }) }),error => {
      diagnostic("MISSING_PERMISSIONS","PANEL_MEMBERS_CHANNEL_ID","members")(error);
      assert.ok(error.message.includes(label));
      for (const [permission,other] of Object.entries(labels)) if (permission !== missing) assert.ok(!error.message.includes(other));
      return true;
    });
    assert.deepEqual(checked,[["ViewChannel"],["SendMessages"],["EmbedLinks"]]);
  }
  for (const result of [null,{}]) {
    const item = channel();
    item.permissionsFor = () => result;
    await assert.rejects(resolveDestination(clientFor([item]),"members",{ env:envFor({ PANEL_MEMBERS_CHANNEL_ID:item.id }) }),
      diagnostic("PERMISSIONS_UNAVAILABLE","PANEL_MEMBERS_CHANNEL_ID","members",/sprawdzić uprawnień/));
  }
});

test("raw SDK error text is replaced by safe typed diagnostics at guild, channel, list and permission lookups",async() => {
  const marker = ["A".repeat(26),"B".repeat(6),"C".repeat(32)].join(".");
  const failure = async() => { throw new Error(`SDK leaked fake token ${marker}`); };
  const guildFailure = clientFor([]);
  guildFailure.guilds.cache.clear(); guildFailure.guilds.fetch = failure;
  const channelFailure = clientFor([]);
  channelFailure.guilds.cache.get(guildId).channels.fetch = failure;
  const listFailure = clientFor([]);
  listFailure.guilds.cache.get(guildId).channels.fetch = failure;
  const item = channel();
  item.permissionsFor = () => { throw new Error(marker); };
  const cases = [
    [guildFailure,envFor({}),"GUILD_UNAVAILABLE","GUILD_ID"],
    [channelFailure,envFor({ PANEL_REPORTS_CHANNEL_ID:channelId }),"CHANNEL_UNAVAILABLE","PANEL_REPORTS_CHANNEL_ID"],
    [listFailure,envFor({}),"CHANNELS_UNAVAILABLE","PANEL_REPORTS_CHANNEL_ID"],
    [clientFor([item]),envFor({ PANEL_REPORTS_CHANNEL_ID:channelId }),"PERMISSIONS_UNAVAILABLE","PANEL_REPORTS_CHANNEL_ID"],
  ];
  for (const [client,env,code,setting] of cases) {
    await assert.rejects(resolveDestination(client,"reports",{ env }),error => {
      diagnostic(code,setting,"reports")(error);
      assert.ok(!error.message.includes(marker));
      assert.ok(!error.stack.includes(marker));
      assert.equal(error.cause,undefined);
      return true;
    });
  }
});

test("persisted diagnostics allow only known code, resource and related setting without accepting message text",() => {
  const error = new NotificationConfigurationError("CHANNEL_MISSING","members");
  const expected = { code:"CHANNEL_MISSING",setting:"PANEL_MEMBERS_CHANNEL_ID",resource:"members" };
  assert.deepEqual(notificationConfigurationDiagnostic(error),expected);
  const stored = { ...expected,message:"PRIVATE_MESSAGE_MUST_NOT_APPEAR",extra:"PRIVATE_EXTRA" };
  assert.deepEqual(notificationConfigurationDiagnostic(stored),expected);
  assert.notEqual(notificationConfigurationDiagnostic(stored),stored);
  assert.deepEqual(notificationConfigurationDiagnostic({ code:"GUILD_UNAVAILABLE",setting:"GUILD_ID",resource:"reports" }),
    { code:"GUILD_UNAVAILABLE",setting:"GUILD_ID",resource:"reports" });
  assert.deepEqual(notificationConfigurationDiagnostic({ code:"CHANNEL_UNAVAILABLE",setting:"REPORT_CHANNEL_ID",resource:"reports" }),
    { code:"CHANNEL_UNAVAILABLE",setting:"REPORT_CHANNEL_ID",resource:"reports" });
  for (const invalid of [null,[],{}, { ...expected,code:"PRIVATE_BAD_CODE" }, { ...expected,resource:"users" },
    { ...expected,setting:"TOKEN" }, { ...expected,setting:"REPORT_CHANNEL_ID" }, { ...expected,setting:"GUILD_ID" },
    { code:"GUILD_UNAVAILABLE",setting:"PANEL_REPORTS_CHANNEL_ID",resource:"reports" },
    { get code() { throw new Error("PRIVATE_GETTER"); } }]) {
    assert.equal(notificationConfigurationDiagnostic(invalid),undefined);
  }
});

const snapshots = {
  members:{ id:"member-id",userId:"100000000000000050",name:"Jan Kowalski",number:12,rank:"Kapral",corps:"Podoficerowie",plus:1,minus:0,reprimands:0 },
  ranks:{ id:"rank-id",userId:"100000000000000050",section:"pracownicy",number:12 },
  reports:{ title:"Raport służbowy",author:"Anna",content:"Służba bez zdarzeń",status:"nowy" },
  calls:{ title:"Wezwanie",target:"Jan Kowalski",reason:"Sprawa służbowa",status:"nowy" },
  documents:{ title:"Wniosek",kind:"notatka",content:"Treść dokumentu",status:"nowy" },
  proposals:{ title:"Szkolenie",author:"Anna",content:"Propozycja szkolenia",status:"nowy" },
  payouts:{ recipient:"Jan Kowalski",amount:500,reason:"Służba",status:"zatwierdzony",paid:true }
};

function event(resource,action="create",snapshot=snapshots[resource]) {
  return { id:"notice-event-id",resource,action,recordId:"notice-record-id",actor:"operator-one",createdAt:"2026-11-07T10:00:00.000Z",snapshot };
}

function embedCharacters(embed) {
  return (embed.title?.length || 0) + (embed.description?.length || 0) + (embed.footer?.text?.length || 0) + (embed.author?.name?.length || 0) + (embed.fields || []).reduce((sum,field) => sum + field.name.length + field.value.length,0);
}

function assertLimits(embed) {
  assert.ok((embed.title?.length || 0) <= 256);
  assert.ok((embed.description?.length || 0) <= 4096);
  assert.ok((embed.footer?.text?.length || 0) <= 2048);
  assert.ok((embed.fields?.length || 0) <= 25);
  for (const field of embed.fields || []) {
    assert.ok(field.name.length >= 1 && field.name.length <= 256);
    assert.ok(field.value.length >= 1 && field.value.length <= 1024);
  }
  assert.ok(embedCharacters(embed) <= 6000);
}

test("all twenty-one resource/action notices serialize through Discord SDK with actor, event, date and target",() => {
  const verbs = { create:"Dodano",update:"Zmieniono",remove:"Usunięto" };
  for (const resource of resources) for (const action of Object.keys(verbs)) {
    const input = event(resource,action);
    const original = structuredClone(input);
    const notice = buildNotice(input);
    assert.ok(notice instanceof EmbedBuilder);
    const serialized = notice.toJSON();
    assert.ok(serialized.title.startsWith(`Panel SW • ${verbs[action]}`),`${resource}/${action}`);
    const text = JSON.stringify(serialized);
    assert.ok(text.includes(input.actor));
    assert.ok(text.includes(input.id));
    assert.ok(text.includes(input.recordId));
    assert.ok(text.includes("2026-11-07"));
    assertLimits(serialized);
    assert.deepEqual(input,original);
  }
});

test("notices keep long input within Discord limits and content excerpts within five hundred characters",() => {
  const fields = ["title","name","recipient","author","content","reason","status","kind","rank","section","corps","number","userId"];
  for (const resource of resources) {
    const snapshot = Object.fromEntries(fields.map(key => [key,key === "content" ? "Z".repeat(30000) : "L".repeat(30000)]));
    const input = event(resource,"update",snapshot);
    input.actor = "A".repeat(30000);
    input.id = "I".repeat(30000);
    input.recordId = "R".repeat(30000);
    const serialized = buildNotice(input).toJSON();
    assertLimits(serialized);
    const excerptRuns = JSON.stringify(serialized).match(/Z+/g) || [];
    assert.ok(excerptRuns.every(run => run.length <= 500));
  }
});

test("unknown sensitive fields and untrusted objects are never serialized or coerced",() => {
  const marker = "PRIVATE_DATA_MUST_NOT_APPEAR";
  const hostile = { token:marker,toString() { throw new Error("Do not coerce caller-owned objects"); } };
  for (const resource of resources) {
    const input = event(resource,"create",{
      ...snapshots[resource],title:hostile,name:hostile,recipient:hostile,author:hostile,content:hostile,reason:hostile,
      TOKEN:marker,password:marker,passwordHash:marker,apiKey:marker,nested:{ secret:marker }
    });
    input.actor = hostile;
    const serialized = buildNotice(input).toJSON();
    const output = JSON.stringify(serialized);
    assert.equal(output.includes(marker),false);
    assert.equal(output.includes("[object Object]"),false);
    assertLimits(serialized);
  }
});

test("payouts and other notices describe ledger changes without claiming transfers or other Discord actions",() => {
  for (const action of ["create","update","remove"]) {
    const payout = JSON.stringify(buildNotice(event("payouts",action)).toJSON());
    assert.match(payout,/ewidencj/i);
    assert.match(payout,/nie.*przelew|bez.*przelew|nie.*transfer|tylko.*wpis/i);
  }
  const document = JSON.stringify(buildNotice(event("documents")).toJSON());
  const rank = JSON.stringify(buildNotice(event("ranks")).toJSON());
  const proposal = JSON.stringify(buildNotice(event("proposals")).toJSON());
  assert.doesNotMatch(document,/utworzono.*ticket|utworzono.*kanał/i);
  assert.doesNotMatch(rank,/nadano.*rolę|przypisano.*rolę/i);
  assert.doesNotMatch(proposal,/uruchomiono.*głosowan|dodano.*reakcj/i);
});
