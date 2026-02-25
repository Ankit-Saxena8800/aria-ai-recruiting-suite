const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

// Zoho Recruit API Configuration
const ZOHO_AUTH_URL = 'https://accounts.zoho.in/oauth/v2/token';
const ZOHO_API_BASE = 'https://recruit.zoho.in/recruit/v2';

class ZohoRecruitClient {
  constructor() {
    this.clientId = process.env.ZOHO_CLIENT_ID;
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
    this.refreshToken = process.env.ZOHO_REFRESH_TOKEN;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  // Get or refresh access token
  async getAccessToken() {
    // If token exists and hasn't expired, return it
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error('Zoho API credentials not configured. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN in environment variables.');
    }

    try {
      const response = await axios.post(ZOHO_AUTH_URL, null, {
        params: {
          refresh_token: this.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token'
        }
      });

      this.accessToken = response.data.access_token;
      // Set expiry to 1 hour from now (Zoho tokens expire in 1 hour)
      this.tokenExpiry = Date.now() + (3600 * 1000);

      console.log('✅ Zoho access token refreshed');
      return this.accessToken;
    } catch (error) {
      console.error('❌ Zoho auth error:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Zoho Recruit');
    }
  }

  // Make authenticated API request
  async apiRequest(endpoint, method = 'GET', data = null) {
    const token = await this.getAccessToken();

    const config = {
      method,
      url: `${ZOHO_API_BASE}${endpoint}`,
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      config.data = data;
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error('❌ Zoho API error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Fetch all active job openings
  async getJobOpenings() {
    try {
      const response = await this.apiRequest('/JobOpenings', 'GET');
      const jobs = response.data || [];

      console.log(`📊 Found ${jobs.length} job openings`);
      return jobs.map(job => ({
        id: job.id,
        title: job.Posting_Title || job.Job_Opening_Name,
        status: job.Job_Opening_Status,
        department: job.Department,
        location: job.City,
        dateOpened: job.Date_Opened,
        numberOfPositions: job.Number_of_Positions,
        experience: job.Required_Skills,
        description: job.Job_Description
      }));
    } catch (error) {
      console.error('Error fetching job openings:', error);
      return [];
    }
  }

  // Fetch candidates for a specific job opening
  async getCandidatesForJob(jobId) {
    try {
      const response = await this.apiRequest(`/Candidates/search?criteria=(Job_Opening_ID:equals:${jobId})`);
      const candidates = response.data || [];

      console.log(`👥 Found ${candidates.length} candidates for job ${jobId}`);
      return candidates.map(candidate => ({
        id: candidate.id,
        name: `${candidate.First_Name} ${candidate.Last_Name}`,
        email: candidate.Email,
        phone: candidate.Mobile,
        currentJobTitle: candidate.Current_Job_Title,
        currentEmployer: candidate.Current_Employer,
        experience: candidate.Experience_in_Years,
        skills: candidate.Skill_Set,
        source: candidate.Candidate_Source,
        appliedDate: candidate.Created_Time,
        status: candidate.Candidate_Status,
        resumeId: candidate.Resume_Attachment_Id
      }));
    } catch (error) {
      console.error(`Error fetching candidates for job ${jobId}:`, error);
      return [];
    }
  }

  // Download resume for a candidate
  async downloadResume(candidateId, resumeId) {
    try {
      const token = await this.getAccessToken();

      const response = await axios.get(
        `${ZOHO_API_BASE}/Candidates/${candidateId}/Attachments/${resumeId}`,
        {
          headers: {
            'Authorization': `Zoho-oauthtoken ${token}`
          },
          responseType: 'arraybuffer'
        }
      );

      return response.data;
    } catch (error) {
      console.error(`Error downloading resume for candidate ${candidateId}:`, error);
      return null;
    }
  }

  // Update candidate status
  async updateCandidateStatus(candidateId, status, notes = '') {
    try {
      const data = {
        data: [{
          id: candidateId,
          Candidate_Status: status,
          Notes: notes
        }]
      };

      await this.apiRequest(`/Candidates`, 'PUT', data);
      console.log(`✅ Updated candidate ${candidateId} status to: ${status}`);
      return true;
    } catch (error) {
      console.error(`Error updating candidate ${candidateId}:`, error);
      return false;
    }
  }

  // Add screening note to candidate
  async addScreeningNote(candidateId, screeningResults) {
    try {
      const noteText = `
🤖 ARIA Automated Screening Results

Overall Match Score: ${screeningResults.score}/100

${screeningResults.summary}

Recommendation: ${screeningResults.recommendation}

Screened on: ${new Date().toLocaleString()}
      `.trim();

      const data = {
        data: [{
          Note_Title: 'ARIA Screening Results',
          Note_Content: noteText,
          Parent_Id: candidateId
        }]
      };

      await this.apiRequest(`/Notes`, 'POST', data);
      console.log(`✅ Added screening note for candidate ${candidateId}`);
      return true;
    } catch (error) {
      console.error(`Error adding note for candidate ${candidateId}:`, error);
      return false;
    }
  }
}

// Automated Screening Pipeline
class AutomatedScreeningPipeline {
  constructor(anthropicApiKey) {
    this.zohoClient = new ZohoRecruitClient();
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
    this.screeningResults = [];
  }

  // Extract text from resume buffer (PDF/DOCX)
  async extractResumeText(resumeBuffer, mimetype) {
    // This would use the same extraction logic from dashboard-server.js
    // Simplified for now - you'll integrate with existing extractTextFromFile
    return resumeBuffer.toString('utf-8');
  }

  // Screen a single candidate using ARIA
  async screenCandidate(candidate, jobDescription) {
    try {
      console.log(`🔍 Screening candidate: ${candidate.name}`);

      // Download resume if available
      let resumeText = '';
      if (candidate.resumeId) {
        const resumeBuffer = await this.zohoClient.downloadResume(candidate.id, candidate.resumeId);
        if (resumeBuffer) {
          resumeText = await this.extractResumeText(resumeBuffer);
        }
      }

      // If no resume, use candidate profile data
      if (!resumeText) {
        resumeText = `
Name: ${candidate.name}
Current Job: ${candidate.currentJobTitle} at ${candidate.currentEmployer}
Experience: ${candidate.experience} years
Skills: ${candidate.skills}
        `.trim();
      }

      // Use ARIA's intelligent screening prompt
      const SCREENING_PROMPT = `You are an elite technical recruiter. Analyze this candidate against the job description and provide a comprehensive assessment.

Provide your analysis with:
1. Overall Match Score (0-100)
2. Brief summary (2-3 sentences)
3. Key strengths (3 bullet points)
4. Key concerns (3 bullet points)
5. Hiring recommendation (STRONG YES / YES / MAYBE / NO / STRONG NO)

Keep it concise but insightful.`;

      const prompt = `JOB DESCRIPTION:\n${jobDescription}\n\nCANDIDATE:\n${resumeText}`;

      const message = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        system: SCREENING_PROMPT,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const analysis = message.content[0].text;

      // Parse score from analysis (simple regex)
      const scoreMatch = analysis.match(/(?:score|match).*?(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 50;

      // Parse recommendation
      const recommendation = analysis.match(/(STRONG YES|YES|MAYBE|NO|STRONG NO)/i)?.[1] || 'MAYBE';

      const result = {
        candidateId: candidate.id,
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        score,
        recommendation,
        summary: analysis,
        screenedAt: new Date().toISOString()
      };

      this.screeningResults.push(result);
      console.log(`✅ Screened ${candidate.name}: ${score}/100 - ${recommendation}`);

      return result;
    } catch (error) {
      console.error(`Error screening candidate ${candidate.name}:`, error);
      return null;
    }
  }

  // Process all candidates for a job
  async processJobCandidates(jobId, jobDescription) {
    try {
      console.log(`\n🚀 Starting automated screening for job ${jobId}`);

      // Fetch all candidates for this job
      const candidates = await this.zohoClient.getCandidatesForJob(jobId);

      if (candidates.length === 0) {
        console.log('No candidates found for this job');
        return { processed: 0, topCandidates: [] };
      }

      console.log(`Found ${candidates.length} candidates to screen\n`);

      // Screen each candidate
      const results = [];
      for (const candidate of candidates) {
        const result = await this.screenCandidate(candidate, jobDescription);
        if (result) {
          results.push(result);

          // Add screening note to Zoho
          await this.zohoClient.addScreeningNote(candidate.id, result);

          // Update status for top candidates
          if (result.score >= 80) {
            await this.zohoClient.updateCandidateStatus(
              candidate.id,
              'Qualified',
              `ARIA Score: ${result.score}/100 - ${result.recommendation}`
            );
          }
        }

        // Rate limiting: wait 1 second between API calls
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Sort by score (highest first)
      results.sort((a, b) => b.score - a.score);

      // Identify top candidates (score >= 80)
      const topCandidates = results.filter(r => r.score >= 80);

      console.log(`\n✅ Screening complete!`);
      console.log(`📊 Total screened: ${results.length}`);
      console.log(`⭐ Top candidates (score ≥ 80): ${topCandidates.length}`);

      return {
        processed: results.length,
        topCandidates,
        allResults: results
      };
    } catch (error) {
      console.error('Error processing job candidates:', error);
      throw error;
    }
  }

  // Process all open jobs
  async processAllJobs() {
    try {
      const jobs = await this.zohoClient.getJobOpenings();
      const results = [];

      for (const job of jobs) {
        if (job.status === 'Open' || job.status === 'In Progress') {
          console.log(`\n📋 Processing job: ${job.title}`);

          const jobResults = await this.processJobCandidates(job.id, job.description);
          results.push({
            jobId: job.id,
            jobTitle: job.title,
            ...jobResults
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error processing all jobs:', error);
      throw error;
    }
  }

  // Generate screening report
  generateReport(results) {
    const report = {
      generatedAt: new Date().toISOString(),
      totalJobs: results.length,
      totalCandidates: results.reduce((sum, r) => sum + r.processed, 0),
      totalTopCandidates: results.reduce((sum, r) => sum + r.topCandidates.length, 0),
      jobs: results.map(job => ({
        title: job.jobTitle,
        candidatesScreened: job.processed,
        topCandidates: job.topCandidates.map(c => ({
          name: c.candidateName,
          email: c.candidateEmail,
          score: c.score,
          recommendation: c.recommendation
        }))
      }))
    };

    return report;
  }
}

module.exports = {
  ZohoRecruitClient,
  AutomatedScreeningPipeline
};
