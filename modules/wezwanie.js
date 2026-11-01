const {
  EmbedBuilder
} = require("discord.js");

const commands = require("./wezwanie-commands");
const roleId = process.env.ROLE_ID;
const callChannelId = process.env.CALL_CHANNEL_ID;

function registerWezwanieModule(client) {
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "wezwanie") return;

  try {
    if (roleId) {
      const member = interaction.member;

      if (!member.roles.cache.has(roleId)) {
        return interaction.reply({
          content: "❌ Nie masz uprawnień do użycia tej komendy.",
          ephemeral: true
        });
      }
    }

    const member = interaction.options.getUser("czlonek", true);
    const robloxUsername = interaction.options.getString("roblox_username", true);
    const robloxId = interaction.options.getString("roblox_id", true);
    const reason = interaction.options.getString("powod", true);
    const time = interaction.options.getString("czas", true);
    const issuer = interaction.user;

    const embed = new EmbedBuilder()
      .setColor(0x2B5D9F)
      .setAuthor({
        name: "Służba Więzienna",
        iconURL: client.user.displayAvatarURL()
      })
      .setTitle("🚨 WEZWANIE FUNKCJONARIUSZA!")
      .setDescription(`> ${member} otrzymał(a) oficjalne wezwanie do stawienia się.`)
      .addFields(
        {
          name: "👤 Członek",
          value: `${member}\n\`${member.username}\``,
          inline: false
        },
        {
          name: "🎮 Roblox Username",
          value: `\`${robloxUsername}\``,
          inline: true
        },
        {
          name: "🆔 Roblox ID",
          value: `\`${robloxId}\``,
          inline: true
        },
        {
          name: "📋 Powód wezwania",
          value: reason,
          inline: false
        },
        {
          name: "⏱️ Czas na stawienie",
          value: `**${time}**`,
          inline: true
        },
        {
          name: "📢 Status",
          value: "🟠 Oczekuje na stawienie się",
          inline: true
        }
      )
      .setFooter({
        text: `Wezwany przez: ${issuer.tag}`,
        iconURL: issuer.displayAvatarURL()
      })
      .setTimestamp();

    const targetChannel = callChannelId
      ? interaction.guild.channels.cache.get(callChannelId)
      : interaction.channel;

    if (!targetChannel || !targetChannel.isTextBased()) {
      return interaction.reply({
        content: "❌ Nie znaleziono poprawnego kanału do wysłania wezwania.",
        ephemeral: true
      });
    }

    await targetChannel.send({
      content: `📢 ${member}`,
      embeds: [embed],
      allowedMentions: { users: [member.id] }
    });

    await interaction.reply({
      content: "✅ Wezwanie zostało wysłane.",
      ephemeral: true
    });
  } catch (error) {
    console.error(error);

    const message = {
      content: "❌ Wystąpił błąd podczas tworzenia wezwania.",
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(message);
    } else {
      await interaction.reply(message);
    }
  }
});

return commands.map(command => command.toJSON());
}

module.exports = { registerWezwanieModule };
