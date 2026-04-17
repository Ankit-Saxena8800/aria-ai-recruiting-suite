const { HR_AGENT_SYSTEM_PROMPT } = require('../config/hr-agent-prompt');

const NEOROUTER_BASE = process.env.NEOROUTER_BASE_URL || 'http://neorouter.stage.in/v1';

class AIService {
  constructor(apiKey, model = 'auto') {
    // apiKey: NEOROUTER_API_KEY (preferred) → GEMINI_API_KEY → ANTHROPIC_API_KEY
    this.apiKey = process.env.NEOROUTER_API_KEY || apiKey;
    this.model = model;
    this.conversations = new Map();
  }

  getConversation(userId) {
    if (!this.conversations.has(userId)) {
      this.conversations.set(userId, []);
    }
    return this.conversations.get(userId);
  }

  clearConversation(userId) {
    this.conversations.delete(userId);
  }

  async sendMessage(userId, userMessage) {
    try {
      const history = this.getConversation(userId);

      const messages = [
        { role: 'system', content: HR_AGENT_SYSTEM_PROMPT },
        ...history.map(msg => ({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content })),
        { role: 'user', content: userMessage },
      ];

      const response = await fetch(`${NEOROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 2048,
          messages,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`NeoRouter ${response.status}: ${errBody}`);
      }

      const rawBody = await response.text();
      const assistantMessage = rawBody.includes('data: ')
        ? rawBody.split('\n').reduce((acc, line) => {
            const l = line.trimEnd();
            if (!l.startsWith('data: ') || l === 'data: [DONE]') return acc;
            try { const c = JSON.parse(l.slice(6)); return acc + (c.choices?.[0]?.delta?.content ?? c.choices?.[0]?.message?.content ?? ''); } catch { return acc; }
          }, '')
        : (JSON.parse(rawBody).choices?.[0]?.message?.content ?? '');

      history.push({ role: 'user', content: userMessage });
      history.push({ role: 'assistant', content: assistantMessage });

      if (history.length > 20) {
        history.splice(0, history.length - 20);
      }

      return {
        success: true,
        message: assistantMessage,
        usage: { model: this.model, provider: 'NeoRouter' },
      };
    } catch (error) {
      console.error('NeoRouter API Error:', error);
      return {
        success: false,
        error: error.message || 'Failed to get response from NeoRouter',
      };
    }
  }

  async resetConversation(userId) {
    this.clearConversation(userId);
    return this.sendMessage(userId, 'menu');
  }

  getStats() {
    return {
      activeConversations: this.conversations.size,
      totalMessages: Array.from(this.conversations.values())
        .reduce((sum, conv) => sum + conv.length, 0),
    };
  }
}

module.exports = AIService;
