const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
  resolveColor,
} = require("discord.js");
const { ViewChannel, SendMessages, ReadMessageHistory } = PermissionFlagsBits;
const { createTranscript } = require("discord-html-transcripts");

const TicketSetup = require("../../Models/TicketSetup");
const ticketSchema = require("../../Models/Ticket");

module.exports = {
  name: "interactionCreate",

  async execute(interaction, client) {
    const {
      customId,

      fields,
      member,

      guild,

      guildId,
    } = interaction;

    if (customId == "ticketModal") {
      const modalSubject = fields.getTextInputValue("modalTicketSubject");
      const modalDescription = fields.getTextInputValue(
        "modalTicketDescription"
      );
      let modalColor =
        fields.getTextInputValue("modalTicketColor") || "#235ee7";

      try {
        resolveColor(modalColor);
        modalColor = modalColor;
      } catch (err) {
        modalColor = "#235ee7";
      }

      const ticketId = Math.floor(Math.random() * 9000) + 10000;

      const data = await TicketSetup.findOne({ GuildID: guildId });

      if (!data)
        return interaction.reply({
          content: `Ticket system has not been set up yet in guild. ||${guildId}||`,
          ephemeral: true,
        });

      try {
        await guild.channels
          .create({
            name: `${member.user.username}-ticket${ticketId}`,
            type: ChannelType.GuildText,
            parent: data.Category,
            permissionOverwrites: [
              {
                id: data.Everyone,
                deny: [ViewChannel, SendMessages, ReadMessageHistory],
              },
              {
                id: member.id,
                allow: [ViewChannel, SendMessages, ReadMessageHistory],
              },
              {
                id: data.Handlers,
                allow: [ViewChannel, SendMessages, ReadMessageHistory],
              },
            ],
          })
          .then(async (channel) => {
            await ticketSchema.create({
              GuildID: guild.id,
              MembersID: member.id,
              TicketID: ticketId,
              ChannelID: channel.id,
              Closed: false,
              Locked: false,
              Type: modalSubject,
              Claimed: false,
            });

            const embed = new EmbedBuilder()
              .addFields(
                { name: "Subject", value: modalSubject },
                { name: "Description", value: modalDescription }
              )
              .setColor(modalColor)
              .setAuthor({
                name: `${member.user.tag}`,
                iconURL: member.displayAvatarURL(),
              })
              .setFooter({
                text: `${ticketId}`,
              })
              .setTimestamp();

            const button = new ActionRowBuilder().setComponents(
              new ButtonBuilder()
                .setCustomId("closeTicketButton")
                .setLabel("Close ticket")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("🔒")
            );

            channel.send({
              embeds: [embed],
              components: [button],
            });

            return interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setDescription(`Ticket created in ${channel}`)
                  .setColor("#235ee7")
                  .setFooter({
                    text: `${ticketId}`,
                  })
                  .setTimestamp(),
              ],
              ephemeral: true,
            });
          });
      } catch (err) {
        console.log(err);
      }
    }

    if (customId == "ticketButton") {
      const modal = new ModalBuilder()
        .setCustomId("ticketModal")
        .setTitle("Create a ticket");

      const modalTitle = new TextInputBuilder()
        .setCustomId("modalTicketSubject")
        .setLabel("Subject")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("For example: Question")
        .setMaxLength(128)
        .setRequired(true);

      const modalDescription = new TextInputBuilder()
        .setCustomId("modalTicketDescription")
        .setLabel("Description")
        .setPlaceholder("Short explanation for your ticket")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const modalColor = new TextInputBuilder()
        .setCustomId("modalTicketColor")
        .setLabel("Ticket Color (Leave blank for default)")
        .setPlaceholder("Pink")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(10)
        .setRequired(false);

      const firstActionRow = new ActionRowBuilder().addComponents(modalTitle);
      const secondActionRow = new ActionRowBuilder().addComponents(
        modalDescription
      );
      const thirdActionRow = new ActionRowBuilder().addComponents(modalColor);

      modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

      await interaction.showModal(modal);
    }

    if (customId == "closeTicketButton") {
      TicketSetup.findOne({ GuildID: guildId }, async (err, docs) => {
        ticketSchema.findOne({ ChannelID: channel.id }, async (err, data) => {
          if (err)
            return interaction.reply({ content: `${err}`, ephemeral: true });

          if (!data)
            return interaction.reply({
              content: "Ticket was not found in the database.",
              ephemeral: true,
            });

          if (data.Closed == true)
            return interaction.reply({
              content: "Ticket is already getting deleted.",
              ephemeral: true,
            });

          const transcript = await createTranscript(channel, {
            limit: -1,
            returnBuffer: false,
            fileName: `ticket-${data.TicketID}.html`,
          });

          data.Closed = true;
          data.save();

          const transcriptEmbed = new EmbedBuilder()
            .addFields(
              { name: `Transcript Type`, value: `${data.Type}` },
              { name: `Ticket ID`, value: `${data.TicketID}` },
              { name: `Closed by`, value: `${member}` }
            )
            .setFooter({
              text: member.user.tag,
              iconURL: member.displayAvatarURL({ dynamic: true }),
            })
            .setColor(0x235ee7)
            .setTimestamp();

          await guild.channels.cache.get(docs.Transcripts).send({
            embeds: [transcriptEmbed],
            files: [transcript],
          });

          await channel.delete();
        });
      });
    }
  },
};
