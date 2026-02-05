# 👩‍💼 Aria - Slack HR Agent

A complete HR & Talent Acquisition agent powered by Claude AI, integrated directly into Slack.

## 🎯 Features

- **30+ HR Functions**: Job descriptions, interview questions, policies, performance reviews, and more
- **Context-Aware**: Remembers conversation history for natural dialogue
- **Multi-Channel Support**: Works via slash commands, DMs, and @mentions
- **Indian Tech Context**: Understands POSH, CTC structures, notice periods, etc.
- **Ready-to-Use Templates**: Get actionable documents, not just advice

## 📋 Prerequisites

- Node.js 18+ installed
- Slack workspace (admin access to install apps)
- Anthropic API key ([get one here](https://console.anthropic.com/))
- Ngrok or similar for local development (optional)

## 🚀 Quick Setup (5 minutes)

### Step 1: Install Dependencies

```bash
cd slack-aria-hr-bot
npm install
```

### Step 2: Create Slack App

1. Go to https://api.slack.com/apps
2. Click **"Create New App"** → **"From scratch"**
3. Name: `Aria HR Agent`
4. Select your workspace

### Step 3: Configure Slack App

**A. Enable Socket Mode (easiest for getting started)**
1. Go to **Settings** → **Socket Mode**
2. Enable Socket Mode
3. Copy the **App-Level Token** (starts with `xapp-`)

**B. Add Bot Scopes**
1. Go to **OAuth & Permissions**
2. Add these **Bot Token Scopes**:
   - `app_mentions:read`
   - `chat:write`
   - `commands`
   - `im:history`
   - `im:read`
   - `im:write`

**C. Create Slash Commands**
1. Go to **Slash Commands** → **Create New Command**

**Command 1:**
- Command: `/aria`
- Request URL: (leave blank for Socket Mode)
- Short Description: `Talk to Aria, your HR assistant`
- Usage Hint: `[your question or menu number]`

**Command 2:**
- Command: `/aria-reset`
- Request URL: (leave blank for Socket Mode)
- Short Description: `Reset your conversation with Aria`

**D. Enable Events**
1. Go to **Event Subscriptions**
2. Enable Events
3. Subscribe to these **Bot Events**:
   - `app_mention`
   - `message.im`

**E. Install App**
1. Go to **Install App**
2. Click **"Install to Workspace"**
3. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### Step 4: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your tokens:

```env
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
SLACK_APP_TOKEN=xapp-your-app-token-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key
```

**Where to find these:**
- `SLACK_BOT_TOKEN`: **OAuth & Permissions** → **Bot User OAuth Token**
- `SLACK_SIGNING_SECRET`: **Basic Information** → **App Credentials** → **Signing Secret**
- `SLACK_APP_TOKEN`: **Basic Information** → **App-Level Tokens**
- `ANTHROPIC_API_KEY`: https://console.anthropic.com/settings/keys

### Step 5: Run the Bot

```bash
npm start
```

You should see:
```
⚡️ Aria HR Bot is running!
📊 Stats: {"activeConversations":0,"totalMessages":0}
🤖 Available commands:
   /aria [message] - Talk to Aria
   /aria-reset - Reset conversation
   @Aria [message] - Mention Aria in channels
   Direct message - DM the bot directly
```

## 💬 How to Use

### Method 1: Slash Command (Recommended)
```
/aria menu
/aria write a job description for senior engineer
/aria 1
```

### Method 2: Direct Message
Open a DM with **@Aria** and just type:
```
menu
help with onboarding checklist
```

### Method 3: Mention in Channels
```
@Aria I need help writing a performance review
```

### Reset Conversation
```
/aria-reset
```

## 🎨 Menu Overview

The bot has 30 ready-to-use HR functions:

- **Recruiting**: Job descriptions, sourcing, outreach, screening, interviews
- **Onboarding**: Checklists, welcome emails, 30-60-90 plans
- **Performance**: Reviews, PIPs, promotions, OKRs
- **Policies**: Leave, remote work, POSH compliance
- **Communications**: Announcements, termination scripts, all-hands
- **Analytics**: Metrics, benchmarking, attrition analysis
- **Difficult Situations**: Exit interviews, conflict resolution

Type `/aria menu` to see the full list!

## 🔒 Access Control (Optional)

To restrict access to specific users:

1. Get Slack User IDs:
   - Click on a user's profile → **More** → **Copy member ID**

2. Add to `.env`:
```env
ALLOWED_USERS=U0123456789,U9876543210
```

Leave empty to allow all workspace members.

## 🚀 Deployment Options

### Option 1: Railway (Recommended - Free tier available)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### Option 2: Heroku
```bash
# Install Heroku CLI, then:
heroku create aria-hr-bot
git push heroku main
heroku config:set SLACK_BOT_TOKEN=xoxb-...
heroku config:set ANTHROPIC_API_KEY=sk-ant-...
```

### Option 3: AWS Lambda (Serverless)
Use the Serverless Framework or SAM to deploy. You'll need to:
- Disable Socket Mode
- Use HTTP endpoint instead
- Configure API Gateway

### Option 4: Local/VPS
Just run `npm start` and keep it running (use PM2 or systemd for persistence).

**With Socket Mode, you don't need public URLs - the easiest option!**

## 💰 Cost Estimate

**Claude API Usage:**
- Light usage (HR team of 5): ~$10-30/month
- Moderate usage (20 managers): ~$50-100/month
- Model: Claude Sonnet 4.5 (balance of speed/quality)

**Hosting:**
- Railway/Render: Free tier available
- Heroku: $7/month
- AWS Lambda: Likely free tier

## 🐛 Troubleshooting

**Bot doesn't respond:**
- Check `npm start` is running without errors
- Verify tokens in `.env` are correct
- Check Slack app has correct scopes
- Look for errors in console logs

**"Unauthorized" errors:**
- Re-install the Slack app to workspace
- Make sure Bot Token starts with `xoxb-`

**Claude API errors:**
- Verify ANTHROPIC_API_KEY is correct
- Check API key has credits
- Check rate limits at https://console.anthropic.com

**Bot loses context:**
- Conversation history is stored in memory (clears on restart)
- For persistent storage, add Redis or database

## 📚 Customization

### Change AI Model
Edit `.env`:
```env
CLAUDE_MODEL=claude-opus-4-5-20251101  # More powerful
CLAUDE_MODEL=claude-haiku-4-20250228   # Faster/cheaper
```

### Modify HR Agent Persona
Edit `config/hr-agent-prompt.js` to customize:
- Tone and style
- Menu items
- Expertise areas
- Company-specific context

### Add New Features
Edit `index.js` to add:
- Custom slash commands
- Button interactions
- File uploads
- Scheduled messages

## 🆘 Support

- **Claude API Docs**: https://docs.anthropic.com
- **Slack API Docs**: https://api.slack.com
- **Issues**: Check console logs first, then search Slack API docs

## 📄 License

MIT - Use freely for your company!

---

**Built with ❤️ using Claude AI and Slack Bolt**

Enjoy your new HR assistant! 🎉
