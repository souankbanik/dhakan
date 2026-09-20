const { SlashCommandBuilder } = require('discord.js');
const aboutDhakan = require('./aboutDhakan');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('about-dhakan')
    .setDescription('Learn about DHAKAN, its core capabilities, and command directory'),

  buildAboutEmbed: aboutDhakan.buildAboutEmbed,
  buildAboutActionRow: aboutDhakan.buildAboutActionRow,
  execute: aboutDhakan.execute,
};
