// Add these to your index.js file to integrate recruiting tools with Slack

const { generateSourcingStrategy } = require('./candidate-sourcer');
const { screenResume } = require('./resume-screener');
const { generateInterviewQuestions } = require('./interview-generator');

// /aria-source command - Generate sourcing strategy
app.command('/aria-source', async ({ command, ack, respond }) => {
  await ack();

  const userId = command.user_id;

  if (!isUserAllowed(userId)) {
    await respond({
      text: '⛔ Sorry, you do not have access to Aria.',
      response_type: 'ephemeral'
    });
    return;
  }

  const jobDescription = command.text.trim();

  if (!jobDescription || jobDescription.length < 50) {
    await respond({
      text: `❌ Please provide a detailed job description (at least 50 characters).

Usage: \`/aria-source Senior Engineer with React, Node.js, 5+ years...\``,
      response_type: 'ephemeral'
    });
    return;
  }

  try {
    await respond({
      text: '🤖 Aria is generating your sourcing strategy... (this may take 10-15 seconds)',
      response_type: 'ephemeral'
    });

    const strategy = await generateSourcingStrategy(jobDescription);

    // Split into multiple messages if too long (Slack limit: 4000 chars)
    const chunks = splitIntoChunks(strategy, 3500);

    for (let i = 0; i < chunks.length; i++) {
      await respond({
        text: i === 0
          ? `✅ *Sourcing Strategy Generated!*\n\n${chunks[i]}`
          : chunks[i],
        response_type: 'in_channel'
      });
    }

    await respond({
      text: '\n💡 *Next Steps:*\n• Copy Boolean strings into Naukri/Indeed\n• Use X-ray searches on Google\n• Follow the sourcing strategy',
      response_type: 'in_channel'
    });

  } catch (error) {
    console.error('Error in /aria-source:', error);
    await respond({
      text: `❌ Error generating sourcing strategy: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
});

// /aria-interview command - Generate interview questions
app.command('/aria-interview', async ({ command, ack, respond }) => {
  await ack();

  const userId = command.user_id;

  if (!isUserAllowed(userId)) {
    await respond({
      text: '⛔ Sorry, you do not have access to Aria.',
      response_type: 'ephemeral'
    });
    return;
  }

  // Parse command: /aria-interview [--type TYPE] JD text
  const args = command.text.trim();
  let jobDescription, interviewType = 'comprehensive';

  if (args.includes('--type')) {
    const parts = args.split('--type');
    const typeAndRest = parts[1].trim().split(' ');
    interviewType = typeAndRest[0];
    jobDescription = typeAndRest.slice(1).join(' ');
  } else {
    jobDescription = args;
  }

  if (!jobDescription || jobDescription.length < 30) {
    await respond({
      text: `❌ Please provide a job description.

Usage: \`/aria-interview Senior Software Engineer with React...\`

Options: \`/aria-interview --type technical Senior Engineer...\`

Types: comprehensive, technical, behavioral, leadership`,
      response_type: 'ephemeral'
    });
    return;
  }

  try {
    await respond({
      text: '🤖 Aria is generating interview questions... (this may take 15-20 seconds)',
      response_type: 'ephemeral'
    });

    const questions = await generateInterviewQuestions(jobDescription, interviewType);

    const chunks = splitIntoChunks(questions, 3500);

    for (let i = 0; i < chunks.length; i++) {
      await respond({
        text: i === 0
          ? `✅ *Interview Questions Generated!*\n\n${chunks[i]}`
          : chunks[i],
        response_type: 'in_channel'
      });
    }

    await respond({
      text: '\n💡 *Next Steps:*\n• Review questions with interview panel\n• Customize for your needs\n• Use scoring rubric during interviews',
      response_type: 'in_channel'
    });

  } catch (error) {
    console.error('Error in /aria-interview:', error);
    await respond({
      text: `❌ Error generating interview questions: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
});

// Helper function to split long text into chunks
function splitIntoChunks(text, maxLength) {
  const chunks = [];
  let current = '';

  const lines = text.split('\n');

  for (const line of lines) {
    if ((current + line + '\n').length > maxLength) {
      if (current) chunks.push(current.trim());
      current = line + '\n';
    } else {
      current += line + '\n';
    }
  }

  if (current) chunks.push(current.trim());

  return chunks;
}

// Export for use in main index.js
module.exports = {
  setupRecruitingCommands: (app, isUserAllowed) => {
    // Add the commands above to the app
    // This would be called from index.js
  }
};
