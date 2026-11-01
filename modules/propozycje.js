const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder,
  TextInputBuilder, TextInputStyle
} = require("discord.js");

const commands = [
  new SlashCommandBuilder().setName("panel-propozycje")
    .setDescription("Panel składania propozycji Służby Więziennej.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).toJSON()
];

async function proposalChannel(guild) {
  const id = process.env.PROPOSALS_CHANNEL_ID;
  if (id) {
    const channel = await guild.channels.fetch(id).catch(() => null);
    if (channel?.isTextBased()) return channel;
    throw new Error("Nie znaleziono kanału PROPOSALS_CHANNEL_ID.");
  }
  const existing = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === "┃propozycje");
  return existing || guild.channels.create({
    name: "┃propozycje", type: ChannelType.GuildText,
    topic: "Propozycje dla Służby Więziennej"
  });
}

function registerPropozycjeModule(client) {
  client.on("interactionCreate", async interaction => {
    const isCommand = interaction.isChatInputCommand() && interaction.commandName === "panel-propozycje";
    const isButton = interaction.isButton() && interaction.customId === "sw_proposal_create";
    const isModal = interaction.isModalSubmit() && interaction.customId === "sw_proposal_modal";
    if (!isCommand && !isButton && !isModal) return;
    try {
      if (isCommand) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
          return interaction.reply({content:"❌ Brak uprawnień.", ephemeral:true});
        const channel = await proposalChannel(interaction.guild);
        await channel.send({
          embeds:[new EmbedBuilder().setTitle("📋 Propozycje | Służba Więzienna")
            .setDescription("Masz pomysł na rozwój SW? Kliknij przycisk i opisz propozycję.")],
          components:[new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("sw_proposal_create")
              .setLabel("Złóż propozycję").setEmoji("➕").setStyle(ButtonStyle.Primary)
          )]
        });
        return interaction.reply({content:"✅ Panel propozycji wysłany.", ephemeral:true});
      }
      if (isButton) {
        return interaction.showModal(
          new ModalBuilder().setCustomId("sw_proposal_modal")
            .setTitle("Złóż propozycję").addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("proposal_content")
                  .setLabel("Treść propozycji").setStyle(TextInputStyle.Paragraph)
                  .setMinLength(10).setMaxLength(1500).setRequired(true)
              )
            )
        );
      }
      const content = interaction.fields.getTextInputValue("proposal_content").trim();
      const channel = await proposalChannel(interaction.guild);
      const message = await channel.send({
        embeds:[new EmbedBuilder().setTitle("💡 Nowa propozycja")
          .setDescription(content)
          .addFields({name:"Autor",value:interaction.user.toString()},
            {name:"Głosowanie",value:"🟢 Popieram | 🟡 Do rozpatrzenia | 🔴 Odrzucam"})
          .setTimestamp()],
        allowedMentions:{parse:[]}
      });
      for (const emoji of ["🟢","🟡","🔴"]) await message.react(emoji);
      return interaction.reply({content:"✅ Propozycja została dodana.", ephemeral:true});
    } catch(error) {
      console.error("Błąd modułu propozycji:", error);
      if (!interaction.replied && !interaction.deferred)
        await interaction.reply({content:"❌ Błąd wysyłania propozycji. Sprawdź uprawnienia i konfigurację kanału.", ephemeral:true}).catch(() => {});
    }
  });
  return commands;
}
module.exports = { registerPropozycjeModule };
