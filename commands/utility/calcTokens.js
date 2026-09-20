const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const PRICING = {
  'gpt-4o': {
    name: 'GPT-4o',
    provider: 'OpenAI',
    inputCostPerM: 2.5,
    outputCostPerM: 10.0,
    contextWindow: '128k',
  },
  'claude-3-5-sonnet': {
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    inputCostPerM: 3.0,
    outputCostPerM: 15.0,
    contextWindow: '200k',
  },
  'gemini-1-5-pro': {
    name: 'Gemini 1.5 Pro',
    provider: 'Google',
    inputCostPerM: 1.25,
    outputCostPerM: 5.0,
    contextWindow: '2M',
  },
};

/**
 * Calculates estimated cost for given tokens and pricing model.
 */
function calculateModelCost(inputTokens, outputTokens, pricing) {
  const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPerM;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputCostPerM;
  const totalCost = inputCost + outputCost;
  return { inputCost, outputCost, totalCost };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('calc-tokens')
    .setDescription('Estimate API tokens and costs across GPT-4o, Claude 3.5 Sonnet, and Gemini 1.5 Pro')
    .addStringOption((option) =>
      option
        .setName('model')
        .setDescription('Select target AI model or compare all')
        .setRequired(true)
        .addChoices(
          { name: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet' },
          { name: 'GPT-4o', value: 'gpt-4o' },
          { name: 'Gemini 1.5 Pro', value: 'gemini-1-5-pro' },
          { name: 'Compare All Models', value: 'all' }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName('input_words')
        .setDescription('Approximate number of input words (prompt / context)')
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption((option) =>
      option
        .setName('output_words')
        .setDescription('Approximate number of output words (generation / completion)')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const modelKey = interaction.options.getString('model');
    const inputWords = interaction.options.getInteger('input_words');
    const outputWords = interaction.options.getInteger('output_words');

    // Rule of thumb: ~1 word ≈ 1.33 tokens
    const inputTokens = Math.round(inputWords * 1.33);
    const outputTokens = Math.round(outputWords * 1.33);
    const totalTokens = inputTokens + outputTokens;

    const embed = new EmbedBuilder()
      .setTitle('⚡ AI Token & Cost Estimator')
      .setColor(0x5865f2)
      .setDescription(
        `Estimates based on standard **~1.33 tokens/word** ratio.\n` +
        `📥 **Input:** \`${inputWords.toLocaleString()} words\` ≈ \`${inputTokens.toLocaleString()} tokens\`\n` +
        `📤 **Output:** \`${outputWords.toLocaleString()} words\` ≈ \`${outputTokens.toLocaleString()} tokens\`\n` +
        `📊 **Total Volume:** \`${totalTokens.toLocaleString()} tokens\``
      )
      .setTimestamp();

    if (modelKey === 'all') {
      for (const [key, p] of Object.entries(PRICING)) {
        const { inputCost, outputCost, totalCost } = calculateModelCost(inputTokens, outputTokens, p);
        embed.addFields({
          name: `${p.name} (${p.provider})`,
          value:
            `• Rates: \`$${p.inputCostPerM.toFixed(2)}/M in\` | \`$${p.outputCostPerM.toFixed(2)}/M out\`\n` +
            `• Input Cost: \`$${inputCost.toFixed(5)}\`\n` +
            `• Output Cost: \`$${outputCost.toFixed(5)}\`\n` +
            `• **Total Estimated Cost:** \`$${totalCost.toFixed(4)}\``,
          inline: true,
        });
      }
    } else {
      const p = PRICING[modelKey];
      if (!p) {
        return interaction.reply({ content: 'Invalid model selected.', ephemeral: true });
      }

      const { inputCost, outputCost, totalCost } = calculateModelCost(inputTokens, outputTokens, p);

      embed.addFields(
        {
          name: 'Selected Model',
          value: `**${p.name}** (${p.provider})\nContext Window: \`${p.contextWindow}\``,
          inline: true,
        },
        {
          name: 'Pricing Rates',
          value: `Input: \`$${p.inputCostPerM.toFixed(2)} / 1M tokens\`\nOutput: \`$${p.outputCostPerM.toFixed(2)} / 1M tokens\``,
          inline: true,
        },
        {
          name: 'Estimated Cost Breakdown',
          value:
            `📥 Input: \`$${inputCost.toFixed(5)}\`\n` +
            `📤 Output: \`$${outputCost.toFixed(5)}\`\n` +
            `💰 **Total: $${totalCost.toFixed(4)}**`,
          inline: false,
        }
      );

      // Comparative preview
      const compLines = Object.values(PRICING)
        .filter((other) => other.name !== p.name)
        .map((other) => {
          const comp = calculateModelCost(inputTokens, outputTokens, other);
          return `• **${other.name}:** \`$${comp.totalCost.toFixed(4)}\``;
        });

      embed.addFields({
        name: 'Comparison with Other Models',
        value: compLines.join('\n'),
      });
    }

    embed.setFooter({ text: 'Prices subject to provider API adjustments • Excludes cached input discounts' });

    await interaction.reply({ embeds: [embed] });
  },
};
