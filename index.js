const { Telegraf } = require('telegraf');
const axios = require('axios');
const OpenAI = require('openai');
const fs = require('fs');
require('dotenv').config();

// OnChain API configuration
const ONCHAIN_API_URL = 'https://autonome.alt.technology/ducky-hzuj/chat';
const ONCHAIN_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'content-type': 'application/json'
};

const MEMORY_FILE = './memory.json';

// Initialize Telegram bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Initialize OpenAI directly with the OpenAI class
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Load memory from file
let memory = {};
if (fs.existsSync(MEMORY_FILE)) {
  memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
}

// Save memory to file
function saveMemory() {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

// Function to call the OnChain API
async function callOnChainAPI(message) {
  try {
    const response = await axios.post(ONCHAIN_API_URL, { message }, { headers: ONCHAIN_HEADERS });
    return response.data.response || 'No response from OnChain API.';
  } catch (error) {
    console.error('OnChain API Error:', error.message);
    return 'Error connecting to the OnChain API.';
  }
}

// Generate a ChatGPT response
async function chatWithGPT(memory, userMessage) {
  const systemPrompt = `
You are OnChainDuck, a blockchain assistant capable of performing on-chain transactions and remembering past interactions.
Here's what you remember so far: ${JSON.stringify(memory)}

If you want to perform an on-chain action, include a line starting with "#USE_ONCHAIN:" 
followed by the exact request string you want to send to the on-chain tool.

If you don't need the on-chain tool, just provide your final answer directly.
If the on-chain tool result is provided to you afterward, incorporate it seamlessly into your final user-facing answer without referencing the tool explicitly.
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('ChatGPT Error:', error.message);
    return 'Error connecting to ChatGPT.';
  }
}

// Start command handler
bot.start((ctx) => {
  const introMessage = `
Hello! I’m *OnChainDuck* 🦆, your blockchain and ChatGPT-powered assistant.
I can:
- Interact with smart contracts and perform on-chain transactions
- Remember things we've done together
- Provide detailed explanations and guidance

Just tell me what you need!
  `;
  ctx.replyWithMarkdown(introMessage);
});

// Message handler
bot.on('text', async (ctx) => {
  const userMessage = ctx.message.text;

  // First, get ChatGPT's initial response
  let gptResponse = await chatWithGPT(memory, userMessage);

  // Check if ChatGPT wants to use the on-chain tool
  const indicator = '#USE_ONCHAIN:';
  if (gptResponse.includes(indicator)) {
    const requestStart = gptResponse.indexOf(indicator) + indicator.length;
    const onChainRequest = gptResponse.slice(requestStart).trim();

    // Call the OnChain API
    const onChainResponse = await callOnChainAPI(onChainRequest);
    memory[Date.now()] = { userMessage, onChainRequest, onChainResponse };
    saveMemory();

    // Provide the on-chain result back to ChatGPT for a final integrated answer
    const followUpMessage = `
The tool request you made: "${onChainRequest}" returned this result:
${onChainResponse}

Please incorporate this into a final, user-facing answer without referencing the tool or process explicitly.
    `;

    gptResponse = await chatWithGPT(memory, followUpMessage);
  }

  ctx.reply(gptResponse);
});

// Launch the bot
bot.launch()
  .then(() => console.log('OnChainDuck is live!'))
  .catch((error) => console.error('Error starting bot:', error.message));

// Graceful stop for termination signals
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
