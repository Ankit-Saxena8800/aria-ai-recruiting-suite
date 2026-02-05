const { GoogleGenerativeAI } = require('@google/generative-ai');
const { HR_AGENT_SYSTEM_PROMPT } = require('../config/hr-agent-prompt');

class AIService {
  constructor(apiKey, model = 'gemini-2.0-flash') {
    this.genAI = new GoogleGenerativeAI(apiKey);
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
   * Send message to Gemini and get response
   */
  async sendMessage(userId, userMessage) {
    try {
      // Get conversation history
      const history = this.getConversation(userId);

      // Create chat session with system instruction
      const model = this.genAI.getGenerativeModel({
        model: this.model,
        systemInstruction: HR_AGENT_SYSTEM_PROMPT,
      });

      // Convert history to Gemini format
      const geminiHistory = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      // Start chat with history
      const chat = model.startChat({
        history: geminiHistory,
      });

      // Send message
      const result = await chat.sendMessage(userMessage);
      const response = await result.response;
      const assistantMessage = response.text();

      // Add to history
      history.push({
        role: 'user',
        content: userMessage
      });
      history.push({
        role: 'assistant',
        content: assistantMessage
      });

      // Keep only last 20 messages to manage memory
      if (history.length > 20) {
        history.splice(0, history.length - 20);
      }

      return {
        success: true,
        message: assistantMessage,
        usage: {
          model: this.model,
          provider: 'Google Gemini'
        }
      };

    } catch (error) {
      console.error('Gemini API Error:', error);
      return {
        success: false,
        error: error.message || 'Failed to get response from Gemini'
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

module.exports = AIService;
