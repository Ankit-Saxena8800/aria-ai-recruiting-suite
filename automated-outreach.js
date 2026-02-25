const nodemailer = require('nodemailer');
const axios = require('axios');

/**
 * Automated Candidate Outreach System
 *
 * Contact methods (in priority order):
 * 1. Phone calls (AI voice or share numbers)
 * 2. WhatsApp (automated messages)
 * 3. Email (automated)
 */

class AutomatedOutreach {
  constructor() {
    // Email configuration
    this.emailTransporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    // WhatsApp API configuration (using WhatsApp Business API or Twilio)
    this.whatsappApiKey = process.env.WHATSAPP_API_KEY;
    this.whatsappPhoneNumber = process.env.WHATSAPP_BUSINESS_NUMBER;

    // AI Voice Call configuration (using services like Bland AI, Vapi, or Synthflow)
    this.voiceCallApiKey = process.env.VOICE_CALL_API_KEY;
    this.voiceCallApiUrl = process.env.VOICE_CALL_API_URL || 'https://api.bland.ai/v1/calls'; // Example: Bland AI
  }

  // Generate personalized outreach message
  generateOutreachMessage(candidate, jobTitle, companyName = 'STAGE') {
    const template = {
      subject: `Exciting Opportunity at ${companyName} - ${jobTitle}`,

      emailBody: `Hi ${candidate.name},

I hope this message finds you well!

I came across your profile and was impressed by your experience in ${candidate.currentJobTitle} at ${candidate.currentEmployer}. Your background aligns perfectly with an exciting opportunity we have at ${companyName}.

We're looking for a ${jobTitle}, and based on your skills and experience, I believe you could be a great fit. Our AI-powered screening system ranked you as a top candidate (Score: ${candidate.score}/100).

Here's what makes this role special:
✓ Work with cutting-edge technology at India's fastest-growing OTT platform
✓ Opportunity to impact millions of users across Bharat
✓ Collaborative team environment with strong growth potential
✓ Competitive compensation and benefits

Would you be interested in learning more? I'd love to schedule a quick 15-minute call to discuss this opportunity.

Looking forward to hearing from you!

Best regards,
Talent Acquisition Team
${companyName}
`,

      whatsappMessage: `Hi ${candidate.name}! 👋

Great news! Your profile stood out for our ${jobTitle} position at ${companyName}. Our AI screening ranked you as a top match (${candidate.score}/100)!

Interested in learning more? Reply YES and I'll share details. 🚀

- STAGE Talent Team`,

      voiceScript: `Hello, this is ARIA, the AI recruiting assistant from ${companyName}. May I speak with ${candidate.name}?

[Wait for response]

Great! I'm calling because your professional profile caught our attention for a ${jobTitle} position at ${companyName}. Based on your experience at ${candidate.currentEmployer}, you're a perfect match for this role.

We'd love to schedule a conversation with our hiring team. Are you currently open to exploring new opportunities?

[If yes]: Wonderful! I'll have a recruiter reach out to you within 24 hours to schedule a detailed discussion. What's the best email to send you more information?

[If no]: I understand. Would it be okay if we keep your information on file for future opportunities that might interest you?

Thank you for your time, ${candidate.name}. Have a great day!`
    };

    return template;
  }

  // Send email to candidate
  async sendEmail(candidate, jobTitle) {
    try {
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.log(`📧 Email not sent to ${candidate.email} - SMTP not configured`);
        return { success: false, method: 'email', reason: 'SMTP not configured' };
      }

      const message = this.generateOutreachMessage(candidate, jobTitle);

      await this.emailTransporter.sendMail({
        from: process.env.EMAIL_FROM || 'ARIA AI <hr@stage.in>',
        to: candidate.email,
        subject: message.subject,
        html: `<pre>${message.emailBody}</pre>`
      });

      console.log(`✅ Email sent to ${candidate.name} (${candidate.email})`);
      return { success: true, method: 'email', email: candidate.email };
    } catch (error) {
      console.error(`❌ Email error for ${candidate.email}:`, error.message);
      return { success: false, method: 'email', error: error.message };
    }
  }

  // Send WhatsApp message to candidate
  async sendWhatsApp(candidate, jobTitle) {
    try {
      if (!this.whatsappApiKey) {
        console.log(`📱 WhatsApp not sent to ${candidate.phone} - API not configured`);
        return { success: false, method: 'whatsapp', reason: 'WhatsApp API not configured' };
      }

      if (!candidate.phone) {
        return { success: false, method: 'whatsapp', reason: 'No phone number' };
      }

      const message = this.generateOutreachMessage(candidate, jobTitle);

      // Example using WhatsApp Business API
      // You'll need to replace this with your actual WhatsApp provider (Twilio, MessageBird, etc.)
      const response = await axios.post('https://api.whatsapp.com/send', {
        phone: candidate.phone,
        message: message.whatsappMessage,
        apiKey: this.whatsappApiKey
      });

      console.log(`✅ WhatsApp sent to ${candidate.name} (${candidate.phone})`);
      return { success: true, method: 'whatsapp', phone: candidate.phone };
    } catch (error) {
      console.error(`❌ WhatsApp error for ${candidate.phone}:`, error.message);
      return { success: false, method: 'whatsapp', error: error.message };
    }
  }

  // Make AI voice call to candidate
  async makeAICall(candidate, jobTitle) {
    try {
      if (!this.voiceCallApiKey) {
        console.log(`📞 AI call not made to ${candidate.phone} - Voice API not configured`);
        return { success: false, method: 'ai_call', reason: 'Voice API not configured' };
      }

      if (!candidate.phone) {
        return { success: false, method: 'ai_call', reason: 'No phone number' };
      }

      const message = this.generateOutreachMessage(candidate, jobTitle);

      // Example using Bland AI or similar voice AI service
      const response = await axios.post(this.voiceCallApiUrl, {
        phone_number: candidate.phone,
        task: message.voiceScript,
        voice: 'maya', // Female voice
        max_duration: 5, // 5 minutes max
        record: true,
        // Additional parameters based on your voice AI provider
      }, {
        headers: {
          'Authorization': `Bearer ${this.voiceCallApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`✅ AI call initiated to ${candidate.name} (${candidate.phone})`);
      return {
        success: true,
        method: 'ai_call',
        phone: candidate.phone,
        callId: response.data.call_id || response.data.id
      };
    } catch (error) {
      console.error(`❌ AI call error for ${candidate.phone}:`, error.message);
      return { success: false, method: 'ai_call', error: error.message };
    }
  }

  // Contact candidate using all available methods (priority order)
  async contactCandidate(candidate, jobTitle) {
    const results = {
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      candidatePhone: candidate.phone,
      contactAttempts: [],
      contactedAt: new Date().toISOString()
    };

    // Priority 1: Phone call (AI voice)
    if (candidate.phone) {
      const callResult = await this.makeAICall(candidate, jobTitle);
      results.contactAttempts.push(callResult);

      if (callResult.success) {
        results.primaryContact = 'ai_call';
      }
    }

    // Priority 2: WhatsApp
    if (candidate.phone) {
      const whatsappResult = await this.sendWhatsApp(candidate, jobTitle);
      results.contactAttempts.push(whatsappResult);

      if (!results.primaryContact && whatsappResult.success) {
        results.primaryContact = 'whatsapp';
      }
    }

    // Priority 3: Email (always try as backup)
    if (candidate.email) {
      const emailResult = await this.sendEmail(candidate, jobTitle);
      results.contactAttempts.push(emailResult);

      if (!results.primaryContact && emailResult.success) {
        results.primaryContact = 'email';
      }
    }

    results.contacted = results.contactAttempts.some(a => a.success);

    console.log(`\n📊 Contact summary for ${candidate.name}:`);
    console.log(`   Primary method: ${results.primaryContact || 'none'}`);
    console.log(`   Attempts: ${results.contactAttempts.length}`);
    console.log(`   Success: ${results.contacted ? 'YES' : 'NO'}\n`);

    return results;
  }

  // Contact all top candidates
  async contactTopCandidates(topCandidates, jobTitle) {
    const results = [];

    for (const candidate of topCandidates) {
      const result = await this.contactCandidate(candidate, jobTitle);
      results.push(result);

      // Rate limiting: wait 2 seconds between contacts
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const summary = {
      totalCandidates: topCandidates.length,
      contacted: results.filter(r => r.contacted).length,
      failed: results.filter(r => !r.contacted).length,
      byMethod: {
        ai_call: results.filter(r => r.primaryContact === 'ai_call').length,
        whatsapp: results.filter(r => r.primaryContact === 'whatsapp').length,
        email: results.filter(r => r.primaryContact === 'email').length
      },
      details: results
    };

    console.log(`\n✅ Outreach Complete!`);
    console.log(`📞 Total contacted: ${summary.contacted}/${summary.totalCandidates}`);
    console.log(`📊 By method: AI Call(${summary.byMethod.ai_call}) | WhatsApp(${summary.byMethod.whatsapp}) | Email(${summary.byMethod.email})`);

    return summary;
  }

  // Generate candidate contact list (for manual calling)
  generateCallList(candidates) {
    return candidates
      .filter(c => c.phone)
      .map(c => ({
        name: c.name,
        phone: c.phone,
        email: c.email,
        currentRole: c.currentJobTitle,
        company: c.currentEmployer,
        score: c.score,
        recommendation: c.recommendation
      }));
  }
}

module.exports = AutomatedOutreach;
