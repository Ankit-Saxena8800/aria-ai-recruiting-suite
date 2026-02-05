const Anthropic = require('@anthropic-ai/sdk');
const { HR_AGENT_SYSTEM_PROMPT } = require('../config/hr-agent-prompt');

class ClaudeService {
  constructor(apiKey, model = 'claude-sonnet-4-5-20250929') {
    this.client = new Anthropic({
      apiKey: apiKey,
    });
    this.model = model;

    // Store conversation history per user
    this.conversations = new Map();
  }

  /**
   * Get or initialize conversation history for a user
   */
  getConversation(userId) {
    if (!this.conversations.has(userId)) {
      this.conversations.set(userId, []);
    }
    return this.conversations.get(userId);
  }

  /**
   * Clear conversation history for a user
   */
  clearConversation(userId) {
    this.conversations.delete(userId);
  }

  /**
   * Send message to Claude and get response
   */
  async sendMessage(userId, userMessage) {
    try {
      // Get conversation history
      const history = this.getConversation(userId);

      // Add user message to history
      history.push({
        role: 'user',
        content: userMessage
      });

      // Call Claude API
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: HR_AGENT_SYSTEM_PROMPT,
        messages: history
      });

      // Extract assistant response
      const assistantMessage = response.content[0].text;

      // Add assistant response to history
      history.push({
        role: 'assistant',
        content: assistantMessage
      });

      // Keep only last 20 messages to manage token usage
      if (history.length > 20) {
        history.splice(0, history.length - 20);
      }

      return {
        success: true,
        message: assistantMessage,
        usage: response.usage
      };

    } catch (error) {
      console.error('Claude API Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Reset conversation and start fresh
   */
  async resetConversation(userId) {
    this.clearConversation(userId);
    return this.sendMessage(userId, 'menu');
  }

  /**
   * Get conversation stats
   */
  getStats() {
    return {
      activeConversations: this.conversations.size,
      totalMessages: Array.from(this.conversations.values())
        .reduce((sum, conv) => sum + conv.length, 0)
    };
  }
}

module.exports = ClaudeService;
