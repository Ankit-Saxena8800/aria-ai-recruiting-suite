# 🚀 QUICK START - Get Aria Running in 5 Minutes

## Step-by-Step Setup

### 1️⃣ Install Dependencies (1 minute)
```bash
cd ~/slack-aria-hr-bot
npm install
```

### 2️⃣ Create Slack App (2 minutes)

1. **Go to**: https://api.slack.com/apps
2. **Click**: "Create New App" → "From scratch"
3. **Name**: `Aria HR Agent`
4. **Select**: Your workspace

### 3️⃣ Configure the App

**Enable Socket Mode (Settings → Socket Mode)**
- Toggle ON
- Generate token → Copy the `xapp-...` token

**Add Bot Scopes (OAuth & Permissions)**
- `app_mentions:read`
- `chat:write`
- `commands`
- `im:history`
- `im:read`
- `im:write`

**Create Slash Commands (Slash Commands)**

Command 1:
- Command: `/aria`
- Description: `Talk to Aria, your HR assistant`

Command 2:
- Command: `/aria-reset`
- Description: `Reset conversation`

**Subscribe to Events (Event Subscriptions)**
- Toggle ON
- Add: `app_mention`, `message.im`

**Install to Workspace (Install App)**
- Click "Install to Workspace"
- Copy the `xoxb-...` token

### 4️⃣ Setup Environment (1 minute)

```bash
cp .env.example .env
```

**Edit `.env` with your tokens:**
```env
SLACK_BOT_TOKEN=xoxb-your-token-here
SLACK_SIGNING_SECRET=your-secret-here
SLACK_APP_TOKEN=xapp-your-token-here
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**Where to find:**
- Bot Token: OAuth & Permissions → Bot User OAuth Token
- Signing Secret: Basic Information → App Credentials
- App Token: Basic Information → App-Level Tokens
- Anthropic Key: https://console.anthropic.com/settings/keys

### 5️⃣ Run It! (30 seconds)

```bash
npm start
```

You should see:
```
⚡️ Aria HR Bot is running!
```

### 6️⃣ Test It!

In Slack, type:
```
/aria menu
```

You should see Aria's menu appear! 🎉

---

## Quick Commands

- `/aria menu` - Show all 30 options
- `/aria 1` - Select menu item #1
- `/aria write a job description` - Natural language
- `/aria-reset` - Start fresh conversation
- DM `@Aria` directly - Works too!

---

## Troubleshooting

**Bot not responding?**
- Check `npm start` is running
- Verify all 3 tokens in `.env`
- Re-install app to workspace

**Need help?**
- See full README.md
- Check console for error logs

---

**That's it! You're ready to use Aria! 🚀**
