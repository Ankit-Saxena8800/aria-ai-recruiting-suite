require('dotenv').config();
const { App } = require('@slack/bolt');
const AIService = require('./utils/ai-service');

// Initialize AI service (Gemini)
const ai = new AIService(
  process.env.NEOROUTER_API_KEY || process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY,
  process.env.AI_MODEL || 'auto'
);

// Initialize Slack app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3000
});

// Access control (optional)
const allowedUsers = process.env.ALLOWED_USERS
  ? process.env.ALLOWED_USERS.split(',').map(id => id.trim())
  : [];

function isUserAllowed(userId) {
  if (allowedUsers.length === 0) return true;
  return allowedUsers.includes(userId);
}

// Helper: Send typing indicator
async function sendTyping(client, channel) {
  try {
    await client.chat.postMessage({
      channel: channel,
      text: '...',
      metadata: {
        event_type: 'typing_indicator'
      }
    });
  } catch (e) {
    // Ignore typing errors
  }
}

// Slash command: /aria
app.command('/aria', async ({ command, ack, respond }) => {
  await ack();

  const userId = command.user_id;

  // Check access
  if (!isUserAllowed(userId)) {
    await respond({
      text: '⛔ Sorry, you do not have access to Aria HR Agent. Please contact your administrator.',
      response_type: 'ephemeral'
    });
    return;
  }

  const userInput = command.text.trim() || 'menu';

  try {
    // Get response from Claude
    const result = await ai.sendMessage(userId, userInput);

    if (result.success) {
      // Split long messages if needed
      const messages = splitMessage(result.message, 3000);

      // Send first message
      await respond({
        text: messages[0],
        response_type: 'in_channel'
      });

      // Send additional messages if needed
      if (messages.length > 1) {
        for (let i = 1; i < messages.length; i++) {
          await respond({
            text: messages[i],
            response_type: 'in_channel'
          });
        }
      }
    } else {
      await respond({
        text: `❌ Error: ${result.error}`,
        response_type: 'ephemeral'
      });
    }
  } catch (error) {
    console.error('Error handling /aria command:', error);
    await respond({
      text: '❌ Something went wrong. Please try again.',
      response_type: 'ephemeral'
    });
  }
});

// Slash command: /aria-reset (clear conversation history)
app.command('/aria-reset', async ({ command, ack, respond }) => {
  await ack();

  const userId = command.user_id;

  if (!isUserAllowed(userId)) {
    await respond({
      text: '⛔ Sorry, you do not have access to Aria HR Agent.',
      response_type: 'ephemeral'
    });
    return;
  }

  try {
    const result = await ai.resetConversation(userId);

    if (result.success) {
      await respond({
        text: `🔄 Conversation reset! Here's the menu:\n\n${result.message}`,
        response_type: 'in_channel'
      });
    } else {
      await respond({
        text: '❌ Failed to reset conversation.',
        response_type: 'ephemeral'
      });
    }
  } catch (error) {
    console.error('Error resetting conversation:', error);
    await respond({
      text: '❌ Something went wrong.',
      response_type: 'ephemeral'
    });
  }
});

// Handle direct messages to the bot
app.message(async ({ message, say, client }) => {
  // Ignore bot messages and threaded messages
  if (message.subtype || message.thread_ts) return;

  const userId = message.user;

  // Check access
  if (!isUserAllowed(userId)) {
    await say({
      text: '⛔ Sorry, you do not have access to Aria HR Agent. Please contact your administrator.'
    });
    return;
  }

  const userInput = message.text.trim();

  try {
    // Show typing indicator
    await client.chat.postMessage({
      channel: message.channel,
      text: '👩‍💼 Aria is thinking...'
    });

    // Get response from Claude
    const result = await ai.sendMessage(userId, userInput);

    if (result.success) {
      // Split long messages (Slack has 4000 char limit)
      const messages = splitMessage(result.message, 3900);

      for (const msg of messages) {
        await say({ text: msg });
      }
    } else {
      await say({
        text: `❌ Error: ${result.error}`
      });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    await say({
      text: '❌ Something went wrong. Please try again.'
    });
  }
});

// Handle app mentions (@Aria)
app.event('app_mention', async ({ event, say, client }) => {
  const userId = event.user;

  if (!isUserAllowed(userId)) {
    await say({
      text: '⛔ Sorry, you do not have access to Aria HR Agent.',
      thread_ts: event.ts
    });
    return;
  }

  // Remove the bot mention from the text
  const userInput = event.text.replace(/<@[A-Z0-9]+>/g, '').trim() || 'menu';

  try {
    await say({
      text: '👩‍💼 Aria is thinking...',
      thread_ts: event.ts
    });

    const result = await ai.sendMessage(userId, userInput);

    if (result.success) {
      const messages = splitMessage(result.message, 3900);

      for (const msg of messages) {
        await say({
          text: msg,
          thread_ts: event.ts
        });
      }
    } else {
      await say({
        text: `❌ Error: ${result.error}`,
        thread_ts: event.ts
      });
    }
  } catch (error) {
    console.error('Error handling mention:', error);
    await say({
      text: '❌ Something went wrong.',
      thread_ts: event.ts
    });
  }
});

// Utility: Split long messages
function splitMessage(text, maxLength = 3900) {
  if (text.length <= maxLength) return [text];

  const messages = [];
  let currentMessage = '';

  const lines = text.split('\n');

  for (const line of lines) {
    if ((currentMessage + line + '\n').length > maxLength) {
      if (currentMessage) messages.push(currentMessage.trim());
      currentMessage = line + '\n';
    } else {
      currentMessage += line + '\n';
    }
  }

  if (currentMessage) messages.push(currentMessage.trim());

  return messages;
}

// Health check endpoint
app.error(async (error) => {
  console.error('Slack app error:', error);
});

// Start the app
(async () => {
  try {
    await app.start();
    console.log('⚡️ Aria HR Bot is running!');
    console.log(`📊 Stats: ${JSON.stringify(ai.getStats())}`);
    console.log('🤖 Available commands:');
    console.log('   /aria [message] - Talk to Aria');
    console.log('   /aria-reset - Reset conversation');
    console.log('   @Aria [message] - Mention Aria in channels');
    console.log('   Direct message - DM the bot directly');
  } catch (error) {
    console.error('Failed to start app:', error);
    process.exit(1);
  }
})();
