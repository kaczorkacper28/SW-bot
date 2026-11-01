const { SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("wezwanie")
    .setDescription("Wystawia wezwanie dla funkcjonariusza.")
    .addUserOption(option =>
      option
        .setName("czlonek")
        .setDescription("Osoba, która ma zostać wezwana.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("roblox_username")
        .setDescription("Nazwa użytkownika Roblox.")
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption(option =>
      option
        .setName("roblox_id")
        .setDescription("ID użytkownika Roblox.")
        .setRequired(true)
        .setMaxLength(30)
    )
    .addStringOption(option =>
      option
        .setName("powod")
        .setDescription("Powód wezwania.")
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addStringOption(option =>
      option
        .setName("czas")
        .setDescription("Np. 5 min, 10 min, 15 min.")
        .setRequired(true)
        .setMaxLength(50)
    )
];

module.exports = commands;
