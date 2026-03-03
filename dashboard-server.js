#!/usr/bin/env node
const express = require('express');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs').promises;
const fsSync = require('fs');
const crypto = require('crypto');
const { calculateMetrics } = require('./hiring-dashboard');
const Anthropic = require('@anthropic-ai/sdk');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Database functions (lazy load to prevent crashes if not configured)
let db;
try {
  db = require('./db');
  console.log('✅ Database module loaded');
} catch (error) {
  console.warn('⚠️  Database module not available:', error.message);
  console.warn('   User management will be disabled. Configure POSTGRES_URL to enable.');
  // Create mock db object to prevent crashes
  db = {
    sql: () => Promise.resolve([]),
    initDatabase: async () => {},
    createUser: async () => { throw new Error('Database not configured'); },
    getUserByUsername: async () => null,
    getAdminByUsername: async () => null,
    getAllUsers: async () => []
  };
}

// Zoho Recruit Automated Screening (lazy load to prevent crashes if not configured)
let AutomatedScreeningPipeline, ZohoRecruitClient, AutomatedOutreach;
try {
  const zohoModule = require('./zoho-recruit');
  AutomatedScreeningPipeline = zohoModule.AutomatedScreeningPipeline;
  ZohoRecruitClient = zohoModule.ZohoRecruitClient;
  AutomatedOutreach = require('./automated-outreach');
  console.log('✅ Automation modules loaded');
} catch (error) {
  console.warn('⚠️  Automation modules not available:', error.message);
  console.warn('   Automated screening will be disabled. Configure Zoho API credentials to enable.');
}

const app = express();

// Initialize database tables on startup (non-blocking)
if (db && db.initDatabase) {
  db.initDatabase().catch(err => {
    console.error('⚠️  Failed to initialize database:', err.message);
  });
}

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // unsafe-eval needed for Chart.js
      scriptSrcAttr: ["'unsafe-inline'"], // CRITICAL: Allow inline onclick handlers
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 attempts (increased for development)
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per IP per hour
  message: { success: false, message: 'Too many registration attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false
});

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_IN_PRODUCTION_' + crypto.randomBytes(32).toString('hex');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Warn if using default JWT secret
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  WARNING: Using default JWT_SECRET. Set JWT_SECRET in .env for production!');
}

// Configure email transporter
const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Email utility functions
async function sendEmail(to, subject, htmlContent) {
  try {
    // If email is not configured, log instead of sending
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD || process.env.EMAIL_PASSWORD === 'your-app-password-here') {
      console.log('📧 Email would be sent to:', to);
      console.log('Subject:', subject);
      console.log('Email not sent - SMTP credentials not configured');
      return { success: true, message: 'Email skipped (not configured)' };
    }

    const info = await emailTransporter.sendMail({
      from: process.env.EMAIL_FROM || 'Aria AI <hr@stage.in>',
      to,
      subject,
      html: htmlContent
    });

    console.log('📧 Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email error:', error.message);
    return { success: false, error: error.message };
  }
}

async function sendWelcomeEmail(user) {
  const template = await fs.readFile(path.join(__dirname, 'email-templates', 'welcome.html'), 'utf-8');
  const html = template
    .replace(/{{firstName}}/g, user.firstName)
    .replace(/{{lastName}}/g, user.lastName)
    .replace(/{{email}}/g, user.email)
    .replace(/{{username}}/g, user.username)
    .replace(/{{department}}/g, user.department)
    .replace(/{{requestedAt}}/g, new Date(user.requestedAt).toLocaleString());

  return sendEmail(user.email, 'Welcome to Aria AI - Registration Pending', html);
}

async function sendApprovalEmail(user) {
  const template = await fs.readFile(path.join(__dirname, 'email-templates', 'approved.html'), 'utf-8');
  const loginUrl = process.env.APP_URL ? `${process.env.APP_URL}/login.html` : 'http://localhost:3001/login.html';
  const html = template
    .replace(/{{firstName}}/g, user.firstName)
    .replace(/{{lastName}}/g, user.lastName)
    .replace(/{{email}}/g, user.email)
    .replace(/{{username}}/g, user.username)
    .replace(/{{loginUrl}}/g, loginUrl);

  return sendEmail(user.email, '✓ Your Aria AI Account Has Been Approved!', html);
}

async function sendRejectionEmail(user) {
  const template = await fs.readFile(path.join(__dirname, 'email-templates', 'rejected.html'), 'utf-8');
  const html = template
    .replace(/{{firstName}}/g, user.firstName)
    .replace(/{{lastName}}/g, user.lastName);

  return sendEmail(user.email, 'Aria AI Account Status Update', html);
}

async function sendAdminNotification(user) {
  const template = await fs.readFile(path.join(__dirname, 'email-templates', 'admin-notification.html'), 'utf-8');
  const adminPanelUrl = process.env.APP_URL ? `${process.env.APP_URL}/admin-users.html` : 'http://localhost:3001/admin-users.html';
  const registrationType = user.ssoProvider ? `Google SSO (${user.ssoProvider})` : 'Username/Password';

  const html = template
    .replace(/{{firstName}}/g, user.firstName)
    .replace(/{{lastName}}/g, user.lastName)
    .replace(/{{email}}/g, user.email)
    .replace(/{{username}}/g, user.username)
    .replace(/{{department}}/g, user.department || 'Not specified')
    .replace(/{{registrationType}}/g, registrationType)
    .replace(/{{requestedAt}}/g, new Date(user.requestedAt).toLocaleString())
    .replace(/{{adminPanelUrl}}/g, adminPanelUrl);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@stage.in';
  return sendEmail(adminEmail, '🔔 New User Registration - Action Required', html);
}
const PORT = process.env.DASHBOARD_PORT || 3001;

// Initialize Claude AI
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Configure multer for file uploads
// Use /tmp for Vercel serverless (only writable directory)
const upload = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// STAGE OTT Platform - Real Hiring Data (Updated: Feb 2026)
const sampleData = {
  openPositions: [
    // Tech Roles
    { title: 'Senior Backend Engineer (Video Streaming)', daysOpen: 38, applicants: 156, screened: 62, interviewed: 18, offered: 3, location: 'Noida/Remote' },
    { title: 'Android Engineer (Mobile Apps)', daysOpen: 42, applicants: 142, screened: 55, interviewed: 15, offered: 2, location: 'Noida' },
    { title: 'iOS Engineer (Mobile Apps)', daysOpen: 48, applicants: 98, screened: 38, interviewed: 12, offered: 1, location: 'Noida/Remote' },
    { title: 'Senior DevOps Engineer (AWS/CDN)', daysOpen: 52, applicants: 87, screened: 32, interviewed: 9, offered: 1, location: 'Remote' },
    { title: 'Frontend Engineer (React)', daysOpen: 28, applicants: 134, screened: 58, interviewed: 16, offered: 3, location: 'Noida' },
    { title: 'Data Engineer - Analytics', daysOpen: 45, applicants: 76, screened: 28, interviewed: 8, offered: 0, location: 'Noida/Remote' },
    { title: 'QA Engineer (Automation)', daysOpen: 33, applicants: 91, screened: 42, interviewed: 11, offered: 2, location: 'Noida' },

    // Non-Tech Roles
    { title: 'Content Manager - Regional Content', daysOpen: 30, applicants: 186, screened: 74, interviewed: 22, offered: 2, location: 'Noida' },
    { title: 'Performance Marketing Manager', daysOpen: 35, applicants: 158, screened: 58, interviewed: 16, offered: 1, location: 'Noida/Remote' },
    { title: 'Growth Manager - User Acquisition', daysOpen: 28, applicants: 142, screened: 62, interviewed: 18, offered: 2, location: 'Noida' },
    { title: 'Content Acquisition Manager', daysOpen: 42, applicants: 95, screened: 38, interviewed: 12, offered: 1, location: 'Noida' },
    { title: 'Customer Success Lead', daysOpen: 25, applicants: 124, screened: 56, interviewed: 14, offered: 2, location: 'Noida' },
    { title: 'Business Development Manager - Partnerships', daysOpen: 38, applicants: 112, screened: 45, interviewed: 11, offered: 0, location: 'Noida' },
    { title: 'Senior Finance Manager', daysOpen: 48, applicants: 76, screened: 28, interviewed: 8, offered: 1, location: 'Noida' },
    { title: 'Talent Acquisition Specialist', daysOpen: 22, applicants: 168, screened: 72, interviewed: 19, offered: 3, location: 'Noida/Remote' },
  ],
  closedPositions: [
    // Tech Hires
    { title: 'Backend Engineer (Python/Django)', timeToFill: 39, applicants: 168, hired: 1, offerAcceptance: 100, hiredDate: '2026-01-22' },
    { title: 'Frontend Engineer (React)', timeToFill: 32, applicants: 142, hired: 2, offerAcceptance: 100, hiredDate: '2026-01-28' },
    { title: 'DevOps Engineer', timeToFill: 44, applicants: 95, hired: 1, offerAcceptance: 100, hiredDate: '2026-01-15' },
    { title: 'Product Designer (UI/UX)', timeToFill: 41, applicants: 88, hired: 1, offerAcceptance: 100, hiredDate: '2026-01-18' },
    { title: 'Mobile Engineer (Android)', timeToFill: 36, applicants: 124, hired: 1, offerAcceptance: 100, hiredDate: '2026-01-25' },
    { title: 'Data Analyst', timeToFill: 28, applicants: 76, hired: 1, offerAcceptance: 100, hiredDate: '2026-01-30' },

    // Non-Tech Hires
    { title: 'Content Operations Manager', timeToFill: 34, applicants: 152, hired: 1, offerAcceptance: 100, hiredDate: '2026-01-20' },
    { title: 'Digital Marketing Manager', timeToFill: 29, applicants: 186, hired: 1, offerAcceptance: 100, hiredDate: '2026-01-24' },
    { title: 'Customer Success Manager', timeToFill: 26, applicants: 134, hired: 1, offerAcceptance: 100, hiredDate: '2026-01-28' },
    { title: 'HR Business Partner', timeToFill: 38, applicants: 142, hired: 1, offerAcceptance: 100, hiredDate: '2026-01-16' },
    { title: 'Content Writer (Regional)', timeToFill: 22, applicants: 198, hired: 2, offerAcceptance: 100, hiredDate: '2026-01-26' },
  ],
  pipeline: {
    totalApplicants: 2842,
    screened: 1048,
    interviewed: 312,
    offered: 48,
    hired: 13
  },
  weeklyMetrics: [
    { week: 'Jan 27 - Feb 2', applicants: 312, screened: 118, interviewed: 34, offered: 7 },
    { week: 'Jan 20 - Jan 26', applicants: 338, screened: 126, interviewed: 38, offered: 10 },
    { week: 'Jan 13 - Jan 19', applicants: 365, screened: 138, interviewed: 42, offered: 13 },
    { week: 'Jan 6 - Jan 12', applicants: 298, screened: 112, interviewed: 32, offered: 8 },
  ]
};

// Helper function to extract text from uploaded files
async function extractTextFromFile(filePath, mimetype) {
  try {
    const buffer = await fs.readFile(filePath);

    if (mimetype === 'application/pdf') {
      const data = await pdfParse(buffer);
      return data.text;
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } else if (mimetype === 'text/plain') {
      return buffer.toString('utf-8');
    } else {
      throw new Error('Unsupported file type');
    }
  } finally {
    // Clean up uploaded file
    try {
      await fs.unlink(filePath);
    } catch (e) {
      console.error('Error deleting file:', e);
    }
  }
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint for candidate sourcing with file upload
app.post('/api/source-candidates-file', upload.single('jdFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Please upload a job description file' });
    }

    let jobDescription = await extractTextFromFile(req.file.path, req.file.mimetype);

    if (!jobDescription || jobDescription.trim() === '') {
      return res.status(400).json({ success: false, error: 'Could not extract text from file' });
    }

    const SOURCING_PROMPT = `You are an expert technical recruiter and Boolean search specialist.

Your task is to analyze a job description and generate comprehensive candidate sourcing strategies.

For the given job description, provide:

1. **Boolean Search Strings** (3-5 variations for job portals like Naukri, Indeed):
   - Include: Required skills, alternate titles, must-have keywords
   - Exclude: Irrelevant roles, students, interns
   - Use proper Boolean operators: AND, OR, NOT, quotes, parentheses

2. **LinkedIn X-Ray Search Strings** (3-5 variations):
   - Use Google X-ray format: site:linkedin.com/in/ [keywords]
   - Include location, experience level, company types
   - Optimize for finding passive candidates

3. **Candidate Profile Criteria**:
   - Must-have skills (technical and soft skills)
   - Preferred experience (years, domains, company types)
   - Red flags to avoid
   - Nice-to-have qualifications

4. **Sourcing Strategy**:
   - Where to find these candidates (platforms, communities, events)
   - Outreach message angle (what would attract them?)
   - Competitive intelligence (what companies to target?)

Be specific, actionable, and creative. Think like a top 1% recruiter.

Format your response in clear sections with markdown.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: SOURCING_PROMPT,
      messages: [{
        role: 'user',
        content: jobDescription
      }]
    });
    const strategy = message.content[0].text;

    res.json({ success: true, strategy });
  } catch (error) {
    console.error('Sourcing error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for candidate sourcing
app.post('/api/source-candidates', async (req, res) => {
  try {
    const { jobDescription } = req.body;

    const SOURCING_PROMPT = `You are an expert technical recruiter and Boolean search specialist.

Your task is to analyze a job description and generate comprehensive candidate sourcing strategies.

For the given job description, provide:

1. **Boolean Search Strings** (3-5 variations for job portals like Naukri, Indeed):
   - Include: Required skills, alternate titles, must-have keywords
   - Exclude: Irrelevant roles, students, interns
   - Use proper Boolean operators: AND, OR, NOT, quotes, parentheses

2. **LinkedIn X-Ray Search Strings** (3-5 variations):
   - Use Google X-ray format: site:linkedin.com/in/ [keywords]
   - Include location, experience level, company types
   - Optimize for finding passive candidates

3. **Candidate Profile Criteria**:
   - Must-have skills (technical and soft skills)
   - Preferred experience (years, domains, company types)
   - Red flags to avoid
   - Nice-to-have qualifications

4. **Sourcing Strategy**:
   - Where to find these candidates (platforms, communities, events)
   - Outreach message angle (what would attract them?)
   - Competitive intelligence (what companies to target?)

Be specific, actionable, and creative. Think like a top 1% recruiter.

Format your response in clear sections with markdown.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: SOURCING_PROMPT,
      messages: [{
        role: 'user',
        content: jobDescription
      }]
    });
    const strategy = message.content[0].text;

    res.json({ success: true, strategy });
  } catch (error) {
    console.error('Sourcing error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for resume screening with file upload
app.post('/api/screen-resume-file', upload.single('resume'), async (req, res) => {
  try {
    const { jobDescription } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Extract text from uploaded file
    const resumeText = await extractTextFromFile(req.file.path, req.file.mimetype);

    const SCREENING_PROMPT = `You are an elite technical recruiter and talent analyst with 15+ years of experience at top tech companies (Google, Meta, Microsoft). You have screened over 10,000 candidates and have a proven track record of identifying top talent.

Your task is to provide a COMPREHENSIVE, INTELLIGENT analysis of a candidate against a job description.

ANALYSIS FRAMEWORK:
1. **Technical Competency Analysis**: Deep-dive into technical skills, years of experience per skill, project complexity
2. **Career Trajectory**: Analyze growth pattern, company progression, role advancement
3. **Cultural & Soft Skills**: Leadership, communication, collaboration indicators
4. **Potential & Growth**: Learning agility, adaptability, innovation indicators
5. **Risk Assessment**: Job hopping patterns, skill gaps, career inconsistencies
6. **Market Positioning**: Salary expectations, competitive alternatives, urgency to hire

Provide your analysis in this EXACT format:

## 🎯 OVERALL MATCH SCORE: [0-100]
**Breakdown**: Technical (X/40) | Experience (X/25) | Culture Fit (X/20) | Growth Potential (X/15)

**One-Sentence Summary**: [Concise verdict on candidate fit]

---

## ✅ KEY STRENGTHS (Top 3-5)
- **[Strength Category]**: [Specific evidence from resume with quantifiable impact]
  - *Why this matters*: [Connection to role requirements]

## ⚠️ GAPS & CONCERNS (Top 3-5)
- **[Gap Category]**: [Specific missing skill or red flag]
  - *Impact*: [How this affects job performance]
  - *Mitigation*: [How to address in interview or onboarding]

---

## 💼 RELEVANT EXPERIENCE DEEP-DIVE
**Most Relevant Role**: [Job title at Company, Duration]
- **What they built**: [Technical projects, scale, impact]
- **Technologies used**: [Stack, tools, frameworks]
- **Leadership/Impact**: [Team size, business impact, metrics]
- **Relevance to this role**: [Direct transferability - High/Medium/Low]

**Career Progression Analysis**:
- [Pattern: Steady growth / Stagnant / Job hopper / Industry switcher]
- [Quality of companies: FAANG → Startup → Mid-size, etc.]

---

## 🎓 EDUCATION & CERTIFICATIONS
- **Degree**: [Degree, University, Year] - [Relevance: High/Medium/Low]
- **Certifications**: [List with recency and relevance]
- **Continuous Learning**: [Evidence of upskilling, courses, conferences]

---

## 🛠️ TECHNICAL SKILLS DEEP ANALYSIS
| Required Skill | Proficiency | Years | Evidence | Gap Analysis |
|----------------|-------------|-------|----------|--------------|
| [Skill] | [Expert/Advanced/Intermediate/Beginner] | X yrs | [Resume reference] | [No gap / Minor gap / Major gap] |

**Skills Summary**:
- ✅ **Strong matches**: [List skills where candidate excels]
- ⚠️ **Skill gaps**: [Missing or weak skills that matter]
- 📈 **Growth areas**: [Skills they're actively learning]

---

## 🧠 INTELLIGENCE INDICATORS
- **Problem-solving complexity**: [Evidence of tackling hard problems]
- **Learning agility**: [New skills acquired, technology adoption speed]
- **Innovation/Creativity**: [Patents, publications, novel solutions]
- **Business acumen**: [Understanding of product, metrics, customer impact]

---

## 🚩 RED FLAGS & RISK ASSESSMENT
- **Job Stability**: [Analysis of tenure patterns - Stable / Moderate risk / High risk]
- **Skill Currency**: [Are skills up-to-date? Using legacy tech?]
- **Career Gaps**: [Any unexplained gaps? Career pivots?]
- **Title Inflation**: [Are titles aligned with experience?]
- **Communication Quality**: [Resume writing quality, clarity]

**Risk Score**: [Low / Medium / High] - [Explanation]

---

## 💰 COMPENSATION & MARKET INSIGHTS
- **Estimated Current Salary**: [Range based on experience, location, company]
- **Expected Salary Range**: [Likely expectation]
- **Market Competitiveness**: [Are they likely interviewing elsewhere?]
- **Urgency**: [High (actively looking) / Medium (open to opportunities) / Low (passive)]

---

## 🎯 INTERVIEW STRATEGY RECOMMENDATIONS
**What to probe in interview**:
1. [Specific technical question to validate skill X]
2. [Behavioral question to assess Y]
3. [Scenario to test problem-solving in Z]

**Questions to ask them**:
- [Tailor to their background and interests]

---

## 💡 HIRING RECOMMENDATION

**VERDICT**: [STRONG YES ⭐ / YES ✅ / MAYBE 🤔 / NO ❌ / STRONG NO 🚫]

**Reasoning**: [2-3 sentences explaining the recommendation with specific evidence]

**Next Steps**:
- ✅ **If proceeding**: [Suggested interview panel, focus areas, timeline]
- ❌ **If rejecting**: [Polite rejection reason, potential fit for other roles]

**Confidence Level**: [High / Medium / Low] - [Why]

---

Be brutally honest, data-driven, and actionable. Your analysis should help make a confident hire/no-hire decision.`;

    const prompt = `JOB DESCRIPTION:\n${jobDescription}\n\nRESUME:\n${resumeText}`;
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: SCREENING_PROMPT,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    const analysis = message.content[0].text;

    res.json({ success: true, analysis });
  } catch (error) {
    console.error('Screening error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for resume screening
app.post('/api/screen-resume', async (req, res) => {
  try {
    const { jobDescription, resumeText } = req.body;

    const SCREENING_PROMPT = `You are an elite technical recruiter and talent analyst with 15+ years of experience at top tech companies (Google, Meta, Microsoft). You have screened over 10,000 candidates and have a proven track record of identifying top talent.

Your task is to provide a COMPREHENSIVE, INTELLIGENT analysis of a candidate against a job description.

ANALYSIS FRAMEWORK:
1. **Technical Competency Analysis**: Deep-dive into technical skills, years of experience per skill, project complexity
2. **Career Trajectory**: Analyze growth pattern, company progression, role advancement
3. **Cultural & Soft Skills**: Leadership, communication, collaboration indicators
4. **Potential & Growth**: Learning agility, adaptability, innovation indicators
5. **Risk Assessment**: Job hopping patterns, skill gaps, career inconsistencies
6. **Market Positioning**: Salary expectations, competitive alternatives, urgency to hire

Provide your analysis in this EXACT format:

## 🎯 OVERALL MATCH SCORE: [0-100]
**Breakdown**: Technical (X/40) | Experience (X/25) | Culture Fit (X/20) | Growth Potential (X/15)

**One-Sentence Summary**: [Concise verdict on candidate fit]

---

## ✅ KEY STRENGTHS (Top 3-5)
- **[Strength Category]**: [Specific evidence from resume with quantifiable impact]
  - *Why this matters*: [Connection to role requirements]

## ⚠️ GAPS & CONCERNS (Top 3-5)
- **[Gap Category]**: [Specific missing skill or red flag]
  - *Impact*: [How this affects job performance]
  - *Mitigation*: [How to address in interview or onboarding]

---

## 💼 RELEVANT EXPERIENCE DEEP-DIVE
**Most Relevant Role**: [Job title at Company, Duration]
- **What they built**: [Technical projects, scale, impact]
- **Technologies used**: [Stack, tools, frameworks]
- **Leadership/Impact**: [Team size, business impact, metrics]
- **Relevance to this role**: [Direct transferability - High/Medium/Low]

**Career Progression Analysis**:
- [Pattern: Steady growth / Stagnant / Job hopper / Industry switcher]
- [Quality of companies: FAANG → Startup → Mid-size, etc.]

---

## 🎓 EDUCATION & CERTIFICATIONS
- **Degree**: [Degree, University, Year] - [Relevance: High/Medium/Low]
- **Certifications**: [List with recency and relevance]
- **Continuous Learning**: [Evidence of upskilling, courses, conferences]

---

## 🛠️ TECHNICAL SKILLS DEEP ANALYSIS
| Required Skill | Proficiency | Years | Evidence | Gap Analysis |
|----------------|-------------|-------|----------|--------------|
| [Skill] | [Expert/Advanced/Intermediate/Beginner] | X yrs | [Resume reference] | [No gap / Minor gap / Major gap] |

**Skills Summary**:
- ✅ **Strong matches**: [List skills where candidate excels]
- ⚠️ **Skill gaps**: [Missing or weak skills that matter]
- 📈 **Growth areas**: [Skills they're actively learning]

---

## 🧠 INTELLIGENCE INDICATORS
- **Problem-solving complexity**: [Evidence of tackling hard problems]
- **Learning agility**: [New skills acquired, technology adoption speed]
- **Innovation/Creativity**: [Patents, publications, novel solutions]
- **Business acumen**: [Understanding of product, metrics, customer impact]

---

## 🚩 RED FLAGS & RISK ASSESSMENT
- **Job Stability**: [Analysis of tenure patterns - Stable / Moderate risk / High risk]
- **Skill Currency**: [Are skills up-to-date? Using legacy tech?]
- **Career Gaps**: [Any unexplained gaps? Career pivots?]
- **Title Inflation**: [Are titles aligned with experience?]
- **Communication Quality**: [Resume writing quality, clarity]

**Risk Score**: [Low / Medium / High] - [Explanation]

---

## 💰 COMPENSATION & MARKET INSIGHTS
- **Estimated Current Salary**: [Range based on experience, location, company]
- **Expected Salary Range**: [Likely expectation]
- **Market Competitiveness**: [Are they likely interviewing elsewhere?]
- **Urgency**: [High (actively looking) / Medium (open to opportunities) / Low (passive)]

---

## 🎯 INTERVIEW STRATEGY RECOMMENDATIONS
**What to probe in interview**:
1. [Specific technical question to validate skill X]
2. [Behavioral question to assess Y]
3. [Scenario to test problem-solving in Z]

**Questions to ask them**:
- [Tailor to their background and interests]

---

## 💡 HIRING RECOMMENDATION

**VERDICT**: [STRONG YES ⭐ / YES ✅ / MAYBE 🤔 / NO ❌ / STRONG NO 🚫]

**Reasoning**: [2-3 sentences explaining the recommendation with specific evidence]

**Next Steps**:
- ✅ **If proceeding**: [Suggested interview panel, focus areas, timeline]
- ❌ **If rejecting**: [Polite rejection reason, potential fit for other roles]

**Confidence Level**: [High / Medium / Low] - [Why]

---

Be brutally honest, data-driven, and actionable. Your analysis should help make a confident hire/no-hire decision.`;

    const prompt = `JOB DESCRIPTION:\n${jobDescription}\n\nRESUME:\n${resumeText}`;
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: SCREENING_PROMPT,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    const analysis = message.content[0].text;

    res.json({ success: true, analysis });
  } catch (error) {
    console.error('Screening error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for interview questions with file upload
app.post('/api/generate-interview-file', upload.single('jdFile'), async (req, res) => {
  try {
    const { interviewType } = req.body;
    let jobDescription = req.body.jobDescription || '';

    if (req.file) {
      jobDescription = await extractTextFromFile(req.file.path, req.file.mimetype);
    }

    const INTERVIEW_PROMPT = `You are an elite interview architect and talent assessment expert from top-tier companies (Google, McKinsey, Amazon). You design interviews that predict on-the-job success with 85%+ accuracy.

Your task is to create a COMPREHENSIVE, INTELLIGENT interview guide that goes beyond surface-level questions.

INTERVIEW DESIGN PRINCIPLES:
1. **Progressive Difficulty**: Start easy, increase complexity to find ceiling
2. **Behavioral + Technical**: Combine STAR method with technical depth
3. **Real-World Scenarios**: Use actual problems the candidate will face
4. **Predictive Validity**: Questions must correlate with job success
5. **Bias Reduction**: Structured rubrics, consistent evaluation
6. **Candidate Experience**: Engaging, respectful, showcases company culture

Generate a COMPLETE interview guide with 25-35 questions across these sections:

---

## 🎯 INTERVIEW STRATEGY OVERVIEW

**Interview Type**: ${interviewType}
**Total Duration**: 60-90 minutes
**Recommended Panel**: [Who should conduct each section]
**Key Success Criteria**: [Top 3 things to evaluate]

---

## 🤝 WARM-UP & CULTURE FIT (5-7 questions, 10-15 min)

**Objective**: Build rapport, assess cultural alignment, understand motivations

### Question 1: [Ice Breaker Question]
**Ask**: "[The actual question]"

**Why This Matters**: [Connection to role success]

**What Great Answers Include**:
- ✅ [Indicator 1]
- ✅ [Indicator 2]
- ✅ [Indicator 3]

**Red Flags**:
- 🚩 [Warning sign 1]
- 🚩 [Warning sign 2]

**Scoring Rubric (1-5)**:
- **5 (Exceptional)**: [Specific criteria]
- **4 (Strong)**: [Specific criteria]
- **3 (Adequate)**: [Specific criteria]
- **2 (Weak)**: [Specific criteria]
- **1 (Poor)**: [Specific criteria]

**Follow-Up Questions**:
- "[Probe deeper on X]"
- "[Clarify Y]"

[Repeat for 5-7 warm-up questions]

---

## 🛠️ TECHNICAL/DOMAIN EXPERTISE (12-18 questions, 35-45 min)

**Objective**: Validate technical competency, depth of knowledge, hands-on experience

**Section A: Foundational Knowledge (4-5 questions)**
[Basic technical questions to establish baseline]

**Section B: Applied Skills (5-7 questions)**
[Practical application, real-world scenarios]

**Section C: Advanced/Expert Level (3-5 questions)**
[Push boundaries, find knowledge ceiling]

### Question [X]: [Technical Question]
**Ask**: "[The actual question with context]"

**Why This Matters**: [Technical skill being validated]

**What Great Answers Include**:
- ✅ [Technical depth indicator]
- ✅ [Practical experience evidence]
- ✅ [Best practices awareness]
- ✅ [Trade-offs understanding]

**Red Flags**:
- 🚩 [Lack of fundamentals]
- 🚩 [No hands-on experience]
- 🚩 [Outdated knowledge]

**Scoring Rubric (1-5)**:
- **5**: [Expert-level answer with nuance]
- **4**: [Strong competency with minor gaps]
- **3**: [Adequate knowledge, needs guidance]
- **2**: [Significant gaps]
- **1**: [Fundamental misunderstanding]

**Difficulty Level**: [Easy / Medium / Hard / Expert]

**Follow-Up Questions**:
- "[Probe implementation details]"
- "[Ask about edge cases]"
- "[Explore alternatives]"

[Repeat for each technical question]

---

## 🧩 PROBLEM-SOLVING & SCENARIOS (4-6 questions, 20-25 min)

**Objective**: Assess analytical thinking, creativity, decision-making under uncertainty

### Scenario [X]: [Real-World Problem]
**Setup**: "[Describe a realistic problem they'll face in this role]"

**Ask**: "How would you approach solving this?"

**What to Look For**:
- 🎯 **Structured Thinking**: [Do they break down the problem?]
- 🎯 **Clarifying Questions**: [Do they ask before jumping to solutions?]
- 🎯 **Multiple Solutions**: [Do they consider alternatives?]
- 🎯 **Trade-off Analysis**: [Do they weigh pros/cons?]
- 🎯 **Execution Plan**: [Do they have a concrete plan?]

**Great Answer Includes**:
1. [Clarifies assumptions]
2. [Breaks down problem systematically]
3. [Proposes 2-3 solutions]
4. [Analyzes trade-offs]
5. [Recommends best approach with reasoning]

**Red Flags**:
- 🚩 Jumps to solution without understanding problem
- 🚩 One-dimensional thinking
- 🚩 No consideration of constraints
- 🚩 Overcomplicates simple problems

**Scoring Rubric (1-5)**:
- **5**: Exceptional problem-solving, considers multiple angles, practical solution
- **4**: Strong analytical approach, minor gaps
- **3**: Adequate problem-solving, needs prompting
- **2**: Struggles with structure
- **1**: Cannot break down problem

**Probing Questions**:
- "What if [constraint X] changes?"
- "How would you handle [edge case]?"
- "What data would you need to validate this?"

[Repeat for 4-6 scenarios]

---

## 💡 BEHAVIORAL & LEADERSHIP (5-8 questions, 15-20 min)

**Objective**: Assess past behavior as predictor of future performance

**Use STAR Framework**: Situation, Task, Action, Result

### Question [X]: [Behavioral Question]
**Ask**: "[Tell me about a time when...]"

**What This Reveals**: [Competency being evaluated]

**STAR Components to Listen For**:
- **Situation**: [Specific context, not generic]
- **Task**: [Clear challenge or goal]
- **Action**: [What THEY did, not the team]
- **Result**: [Quantifiable impact, lessons learned]

**Great Answer Includes**:
- ✅ Specific example with details
- ✅ Clear ownership of actions
- ✅ Quantified results
- ✅ Reflection and learning

**Red Flags**:
- 🚩 Vague or generic example
- 🚩 Takes credit for team work
- 🚩 No measurable outcome
- 🚩 Blames others for failures

**Scoring Rubric (1-5)**:
- **5**: Exceptional story, clear impact, strong self-awareness
- **4**: Good example, demonstrates competency
- **3**: Adequate but lacks depth or impact
- **2**: Weak example or unclear role
- **1**: Cannot provide relevant example

**Probing Questions**:
- "What was YOUR specific role?"
- "What would you do differently?"
- "How did you measure success?"

[Repeat for 5-8 behavioral questions]

---

## 🎯 CANDIDATE EVALUATION FRAMEWORK

### Overall Scoring Matrix
| Dimension | Weight | Score (1-5) | Comments |
|-----------|--------|-------------|----------|
| Technical Skills | 40% | | |
| Problem-Solving | 25% | | |
| Culture Fit | 20% | | |
| Growth Potential | 15% | | |
| **TOTAL** | 100% | | |

### Decision Guidelines:
- **4.5-5.0**: STRONG YES - Top 5% candidate, hire immediately
- **4.0-4.4**: YES - Strong hire, proceed to final round
- **3.5-3.9**: MAYBE - Good candidate, needs more data
- **3.0-3.4**: LEANING NO - Significant concerns
- **<3.0**: NO - Does not meet bar

---

## 📋 INTERVIEWER TIPS

**Before Interview**:
- Review resume thoroughly
- Note specific projects/experiences to probe
- Prepare customized follow-ups

**During Interview**:
- Take detailed notes on answers
- Use probing questions generously
- Watch for non-verbal cues
- Give candidate time to think
- Be aware of unconscious bias

**After Interview**:
- Write feedback within 24 hours
- Provide specific examples
- Make clear hire/no-hire recommendation
- Suggest next steps

---

## 🗣️ QUESTIONS FOR CANDIDATE TO ASK US

Be prepared to answer:
- [Question about team/role]
- [Question about growth opportunities]
- [Question about company vision]
- [Question about challenges]

**Red flag if candidate asks**: [Inappropriate or concerning questions]

---

Be thorough, specific, and ensure questions are legally compliant and bias-free. Focus on job-relevant competencies.`;

    const prompt = `Generate ${interviewType} interview questions for:\n${jobDescription}`;
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: INTERVIEW_PROMPT,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    const questions = message.content[0].text;

    res.json({ success: true, questions });
  } catch (error) {
    console.error('Interview generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for interview questions
app.post('/api/generate-interview', async (req, res) => {
  try {
    const { jobDescription, interviewType } = req.body;

    const INTERVIEW_PROMPT = `You are an elite interview architect and talent assessment expert from top-tier companies (Google, McKinsey, Amazon). You design interviews that predict on-the-job success with 85%+ accuracy.

Your task is to create a COMPREHENSIVE, INTELLIGENT interview guide that goes beyond surface-level questions.

INTERVIEW DESIGN PRINCIPLES:
1. **Progressive Difficulty**: Start easy, increase complexity to find ceiling
2. **Behavioral + Technical**: Combine STAR method with technical depth
3. **Real-World Scenarios**: Use actual problems the candidate will face
4. **Predictive Validity**: Questions must correlate with job success
5. **Bias Reduction**: Structured rubrics, consistent evaluation
6. **Candidate Experience**: Engaging, respectful, showcases company culture

Generate a COMPLETE interview guide with 25-35 questions across these sections:

---

## 🎯 INTERVIEW STRATEGY OVERVIEW

**Interview Type**: ${interviewType}
**Total Duration**: 60-90 minutes
**Recommended Panel**: [Who should conduct each section]
**Key Success Criteria**: [Top 3 things to evaluate]

---

## 🤝 WARM-UP & CULTURE FIT (5-7 questions, 10-15 min)

**Objective**: Build rapport, assess cultural alignment, understand motivations

### Question 1: [Ice Breaker Question]
**Ask**: "[The actual question]"

**Why This Matters**: [Connection to role success]

**What Great Answers Include**:
- ✅ [Indicator 1]
- ✅ [Indicator 2]
- ✅ [Indicator 3]

**Red Flags**:
- 🚩 [Warning sign 1]
- 🚩 [Warning sign 2]

**Scoring Rubric (1-5)**:
- **5 (Exceptional)**: [Specific criteria]
- **4 (Strong)**: [Specific criteria]
- **3 (Adequate)**: [Specific criteria]
- **2 (Weak)**: [Specific criteria]
- **1 (Poor)**: [Specific criteria]

**Follow-Up Questions**:
- "[Probe deeper on X]"
- "[Clarify Y]"

[Repeat for 5-7 warm-up questions]

---

## 🛠️ TECHNICAL/DOMAIN EXPERTISE (12-18 questions, 35-45 min)

**Objective**: Validate technical competency, depth of knowledge, hands-on experience

**Section A: Foundational Knowledge (4-5 questions)**
[Basic technical questions to establish baseline]

**Section B: Applied Skills (5-7 questions)**
[Practical application, real-world scenarios]

**Section C: Advanced/Expert Level (3-5 questions)**
[Push boundaries, find knowledge ceiling]

### Question [X]: [Technical Question]
**Ask**: "[The actual question with context]"

**Why This Matters**: [Technical skill being validated]

**What Great Answers Include**:
- ✅ [Technical depth indicator]
- ✅ [Practical experience evidence]
- ✅ [Best practices awareness]
- ✅ [Trade-offs understanding]

**Red Flags**:
- 🚩 [Lack of fundamentals]
- 🚩 [No hands-on experience]
- 🚩 [Outdated knowledge]

**Scoring Rubric (1-5)**:
- **5**: [Expert-level answer with nuance]
- **4**: [Strong competency with minor gaps]
- **3**: [Adequate knowledge, needs guidance]
- **2**: [Significant gaps]
- **1**: [Fundamental misunderstanding]

**Difficulty Level**: [Easy / Medium / Hard / Expert]

**Follow-Up Questions**:
- "[Probe implementation details]"
- "[Ask about edge cases]"
- "[Explore alternatives]"

[Repeat for each technical question]

---

## 🧩 PROBLEM-SOLVING & SCENARIOS (4-6 questions, 20-25 min)

**Objective**: Assess analytical thinking, creativity, decision-making under uncertainty

### Scenario [X]: [Real-World Problem]
**Setup**: "[Describe a realistic problem they'll face in this role]"

**Ask**: "How would you approach solving this?"

**What to Look For**:
- 🎯 **Structured Thinking**: [Do they break down the problem?]
- 🎯 **Clarifying Questions**: [Do they ask before jumping to solutions?]
- 🎯 **Multiple Solutions**: [Do they consider alternatives?]
- 🎯 **Trade-off Analysis**: [Do they weigh pros/cons?]
- 🎯 **Execution Plan**: [Do they have a concrete plan?]

**Great Answer Includes**:
1. [Clarifies assumptions]
2. [Breaks down problem systematically]
3. [Proposes 2-3 solutions]
4. [Analyzes trade-offs]
5. [Recommends best approach with reasoning]

**Red Flags**:
- 🚩 Jumps to solution without understanding problem
- 🚩 One-dimensional thinking
- 🚩 No consideration of constraints
- 🚩 Overcomplicates simple problems

**Scoring Rubric (1-5)**:
- **5**: Exceptional problem-solving, considers multiple angles, practical solution
- **4**: Strong analytical approach, minor gaps
- **3**: Adequate problem-solving, needs prompting
- **2**: Struggles with structure
- **1**: Cannot break down problem

**Probing Questions**:
- "What if [constraint X] changes?"
- "How would you handle [edge case]?"
- "What data would you need to validate this?"

[Repeat for 4-6 scenarios]

---

## 💡 BEHAVIORAL & LEADERSHIP (5-8 questions, 15-20 min)

**Objective**: Assess past behavior as predictor of future performance

**Use STAR Framework**: Situation, Task, Action, Result

### Question [X]: [Behavioral Question]
**Ask**: "[Tell me about a time when...]"

**What This Reveals**: [Competency being evaluated]

**STAR Components to Listen For**:
- **Situation**: [Specific context, not generic]
- **Task**: [Clear challenge or goal]
- **Action**: [What THEY did, not the team]
- **Result**: [Quantifiable impact, lessons learned]

**Great Answer Includes**:
- ✅ Specific example with details
- ✅ Clear ownership of actions
- ✅ Quantified results
- ✅ Reflection and learning

**Red Flags**:
- 🚩 Vague or generic example
- 🚩 Takes credit for team work
- 🚩 No measurable outcome
- 🚩 Blames others for failures

**Scoring Rubric (1-5)**:
- **5**: Exceptional story, clear impact, strong self-awareness
- **4**: Good example, demonstrates competency
- **3**: Adequate but lacks depth or impact
- **2**: Weak example or unclear role
- **1**: Cannot provide relevant example

**Probing Questions**:
- "What was YOUR specific role?"
- "What would you do differently?"
- "How did you measure success?"

[Repeat for 5-8 behavioral questions]

---

## 🎯 CANDIDATE EVALUATION FRAMEWORK

### Overall Scoring Matrix
| Dimension | Weight | Score (1-5) | Comments |
|-----------|--------|-------------|----------|
| Technical Skills | 40% | | |
| Problem-Solving | 25% | | |
| Culture Fit | 20% | | |
| Growth Potential | 15% | | |
| **TOTAL** | 100% | | |

### Decision Guidelines:
- **4.5-5.0**: STRONG YES - Top 5% candidate, hire immediately
- **4.0-4.4**: YES - Strong hire, proceed to final round
- **3.5-3.9**: MAYBE - Good candidate, needs more data
- **3.0-3.4**: LEANING NO - Significant concerns
- **<3.0**: NO - Does not meet bar

---

## 📋 INTERVIEWER TIPS

**Before Interview**:
- Review resume thoroughly
- Note specific projects/experiences to probe
- Prepare customized follow-ups

**During Interview**:
- Take detailed notes on answers
- Use probing questions generously
- Watch for non-verbal cues
- Give candidate time to think
- Be aware of unconscious bias

**After Interview**:
- Write feedback within 24 hours
- Provide specific examples
- Make clear hire/no-hire recommendation
- Suggest next steps

---

## 🗣️ QUESTIONS FOR CANDIDATE TO ASK US

Be prepared to answer:
- [Question about team/role]
- [Question about growth opportunities]
- [Question about company vision]
- [Question about challenges]

**Red flag if candidate asks**: [Inappropriate or concerning questions]

---

Be thorough, specific, and ensure questions are legally compliant and bias-free. Focus on job-relevant competencies.`;

    const prompt = `Generate ${interviewType} interview questions for:\n${jobDescription}`;
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: INTERVIEW_PROMPT,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    const questions = message.content[0].text;

    res.json({ success: true, questions });
  } catch (error) {
    console.error('Interview generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for JD generation with file upload
app.post('/api/generate-jd-file', upload.single('existingJD'), async (req, res) => {
  try {
    const { jobTitle, experience, skills, location, additional } = req.body;
    let existingJDText = '';

    if (req.file) {
      existingJDText = await extractTextFromFile(req.file.path, req.file.mimetype);
    }

    const prompt = existingJDText
      ? `Improve/rewrite this job description:\n${existingJDText}\n\nFocus on: ${jobTitle}, ${experience}, ${skills}, ${location}`
      : `Create a professional job description for:\nTitle: ${jobTitle}\nExperience: ${experience}\nSkills: ${skills}\nLocation: ${location}\nAdditional: ${additional}\n\nFormat: Company overview, role summary, responsibilities, requirements, nice-to-have, benefits.`;
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    res.json({ success: true, jd: message.content[0].text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for JD generation
app.post('/api/generate-jd', async (req, res) => {
  try {
    const { jobTitle, experience, skills, location, additional } = req.body;
    const prompt = `Create a professional job description for:\nTitle: ${jobTitle}\nExperience: ${experience}\nSkills: ${skills}\nLocation: ${location}\nAdditional: ${additional}\n\nFormat: Company overview, role summary, responsibilities, requirements, nice-to-have, benefits.`;
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    res.json({ success: true, jd: message.content[0].text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for email templates
app.post('/api/generate-email', async (req, res) => {
  try {
    const { emailType, candidateName, jobTitle, context } = req.body;
    const prompt = `Write a professional ${emailType} email to ${candidateName} for ${jobTitle} position. Context: ${context}. Make it warm, professional, and personalized.`;
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    res.json({ success: true, email: message.content[0].text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for offer letter
app.post('/api/generate-offer', async (req, res) => {
  try {
    const { candidateName, position, salary, startDate, location } = req.body;
    const prompt = `Create a professional offer letter for:\nCandidate: ${candidateName}\nPosition: ${position}\nCTC: ${salary} LPA\nStart Date: ${startDate}\nLocation: ${location}\nCompany: STAGE OTT Platform\n\nInclude: welcome message, role details, compensation, benefits, joining date, terms.`;
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    res.json({ success: true, offer: message.content[0].text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for candidate comparison with file uploads
app.post('/api/compare-candidates-files', upload.array('resumes', 5), async (req, res) => {
  try {
    const { jd } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    if (req.files.length < 2) {
      return res.status(400).json({ success: false, error: 'Please upload at least 2 resumes to compare' });
    }

    if (!jd || jd.trim() === '') {
      return res.status(400).json({ success: false, error: 'Please provide a job description' });
    }

    // Extract text from all uploaded resume files
    const resumeTexts = await Promise.all(
      req.files.map(file => extractTextFromFile(file.path, file.mimetype))
    );

    const prompt = `Compare these candidates for the role:\n\nJOB DESCRIPTION:\n${jd}\n\nCANDIDATES:\n${resumeTexts.map((r, i) => `CANDIDATE ${i+1}:\n${r}`).join('\n\n')}\n\nProvide: Side-by-side comparison table, scores (0-100), strengths/weaknesses, ranking, final recommendation.`;
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    res.json({ success: true, comparison: message.content[0].text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for candidate comparison
app.post('/api/compare-candidates', async (req, res) => {
  try {
    const { jd, resumes } = req.body;
    const prompt = `Compare these candidates for the role:\n\nJOB DESCRIPTION:\n${jd}\n\nCANDIDATES:\n${resumes.map((r, i) => `CANDIDATE ${i+1}:\n${r}`).join('\n\n')}\n\nProvide: Side-by-side comparison table, scores (0-100), strengths/weaknesses, ranking, final recommendation.`;
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    res.json({ success: true, comparison: message.content[0].text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for salary benchmarking
app.post('/api/salary-benchmark', async (req, res) => {
  try {
    const { role, experience, location, skills } = req.body;
    const prompt = `Provide salary benchmarking for:\nRole: ${role}\nExperience: ${experience} years\nLocation: ${location}\nSkills: ${skills}\n\nProvide: Salary range (min-median-max), market trends, factors affecting salary, comparison with similar roles. Use 2026 India market data.`;
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    res.json({ success: true, salary: message.content[0].text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for reference check questions
app.post('/api/reference-questions', async (req, res) => {
  try {
    const { name, position } = req.body;
    const prompt = `Generate comprehensive reference check questions for ${name} applying for ${position}. Include: Work performance, technical skills, teamwork, leadership, areas for improvement, eligibility for rehire. 15-20 questions.`;
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    res.json({ success: true, questions: message.content[0].text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for interview feedback form
app.post('/api/feedback-form', async (req, res) => {
  try {
    const { position, type } = req.body;
    const prompt = `Create a structured interview feedback form for ${position} (${type} interview). Include: Rating scales (1-5), evaluation criteria, technical assessment, behavioral assessment, decision recommendation (Strong Yes/Yes/Maybe/No/Strong No), comments section.`;
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    res.json({ success: true, form: message.content[0].text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for onboarding checklist
app.post('/api/onboarding-checklist', async (req, res) => {
  try {
    const { name, position, dept } = req.body;
    const prompt = `Create comprehensive onboarding checklist for ${name} joining as ${position} in ${dept} at STAGE. Include: Pre-joining (documents, laptop setup), Day 1 (welcome, orientation, team intro), Week 1 (training, tools access, first tasks), Month 1 (goals, check-ins, feedback).`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    res.json({ success: true, checklist: message.content[0].text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for dashboard data
app.get('/api/dashboard', (req, res) => {
  const metrics = calculateMetrics(sampleData);

  res.json({
    metrics,
    data: sampleData,
    lastUpdated: new Date().toISOString()
  });
});

// ============================================================================
// AUTOMATED CANDIDATE SCREENING ENDPOINTS
// ============================================================================

// Trigger automated screening for a specific job
app.post('/api/automate/screen-job', authenticateToken, requireAdmin, apiLimiter, async (req, res) => {
  try {
    if (!AutomatedScreeningPipeline) {
      return res.status(503).json({
        success: false,
        message: 'Automation not available. Please configure Zoho API credentials.'
      });
    }

    const { jobId, jobDescription } = req.body;

    if (!jobId || !jobDescription) {
      return res.json({ success: false, message: 'Job ID and description required' });
    }

    const pipeline = new AutomatedScreeningPipeline(process.env.ANTHROPIC_API_KEY);
    const results = await pipeline.processJobCandidates(jobId, jobDescription);

    res.json({
      success: true,
      message: `Screened ${results.processed} candidates`,
      results: {
        processed: results.processed,
        topCandidates: results.topCandidates.length,
        topCandidatesList: results.topCandidates
      }
    });
  } catch (error) {
    console.error('Automated screening error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Automated screening failed'
    });
  }
});

// Trigger automated screening for ALL open jobs
app.post('/api/automate/screen-all-jobs', authenticateToken, requireAdmin, apiLimiter, async (req, res) => {
  try {
    if (!AutomatedScreeningPipeline) {
      return res.status(503).json({
        success: false,
        message: 'Automation not available. Please configure Zoho API credentials.'
      });
    }

    const pipeline = new AutomatedScreeningPipeline(process.env.ANTHROPIC_API_KEY);
    const results = await pipeline.processAllJobs();
    const report = pipeline.generateReport(results);

    res.json({
      success: true,
      message: `Automated screening complete!`,
      report
    });
  } catch (error) {
    console.error('Automated screening error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Automated screening failed'
    });
  }
});

// Get all job openings from Zoho Recruit
app.get('/api/zoho/jobs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!ZohoRecruitClient) {
      return res.status(503).json({
        success: false,
        message: 'Zoho integration not available. Please configure Zoho API credentials.'
      });
    }

    const zohoClient = new ZohoRecruitClient();
    const jobs = await zohoClient.getJobOpenings();

    res.json({
      success: true,
      jobs
    });
  } catch (error) {
    console.error('Zoho jobs fetch error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch jobs from Zoho Recruit'
    });
  }
});

// Get candidates for a specific job from Zoho
app.get('/api/zoho/job/:jobId/candidates', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    const zohoClient = new ZohoRecruitClient();
    const candidates = await zohoClient.getCandidatesForJob(jobId);

    res.json({
      success: true,
      candidates
    });
  } catch (error) {
    console.error('Zoho candidates fetch error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch candidates from Zoho Recruit'
    });
  }
});

// Test Zoho API connection
app.get('/api/zoho/test-connection', authenticateToken, requireAdmin, async (req, res) => {
  const configured = !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN);

  if (!ZohoRecruitClient || !configured) {
    return res.status(503).json({
      success: false,
      configured,
      message: 'Zoho credentials not configured. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN in Vercel environment variables.'
    });
  }

  try {
    const zohoClient = new ZohoRecruitClient();
    await zohoClient.getAccessToken();
    res.json({ success: true, configured, message: '✅ Zoho Recruit API connection successful!' });
  } catch (error) {
    res.status(500).json({ success: false, configured, message: error.message });
  }
});

// Contact top candidates with automated outreach
app.post('/api/automate/contact-candidates', authenticateToken, requireAdmin, apiLimiter, async (req, res) => {
  try {
    const { candidates, jobTitle } = req.body;

    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
      return res.json({ success: false, message: 'No candidates provided' });
    }

    const outreach = new AutomatedOutreach();
    const results = await outreach.contactTopCandidates(candidates, jobTitle);

    res.json({
      success: true,
      message: `Contacted ${results.contacted}/${results.totalCandidates} candidates`,
      results
    });
  } catch (error) {
    console.error('Automated outreach error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Automated outreach failed'
    });
  }
});

// Generate call list for manual outreach
app.post('/api/automate/generate-call-list', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { candidates } = req.body;

    if (!candidates || !Array.isArray(candidates)) {
      return res.json({ success: false, message: 'No candidates provided' });
    }

    const outreach = new AutomatedOutreach();
    const callList = outreach.generateCallList(candidates);

    res.json({
      success: true,
      callList
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate call list'
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve main homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve dashboard HTML (new version with STAGE branding)
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard-v2.html'));
});

// Legacy dashboard
app.get('/v1', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ============================================
// AUTHENTICATION & USER MANAGEMENT ENDPOINTS
// ============================================

const USERS_FILE = path.join(__dirname, 'users.json');

// Google OAuth Configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_CALLBACK_URL
);

// Helper functions for user management (now using database)
function mapDbUser(u) {
  return {
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    email: u.email,
    username: u.username,
    department: u.department,
    status: u.status,
    role: u.role,
    ssoProvider: u.sso_provider,
    requestedAt: u.requested_at,
    updatedAt: u.updated_at,
    deletedAt: u.deleted_at
  };
}

function mapDbBlacklistEntry(b) {
  return {
    id: b.id,
    email: b.email,
    username: b.username,
    firstName: b.first_name,
    lastName: b.last_name,
    reason: b.reason,
    blacklistedAt: b.blacklisted_at,
    originalUserId: b.original_user_id
  };
}

function mapDbAuditLog(l) {
  return {
    id: l.id,
    timestamp: l.timestamp,
    action: l.action,
    userId: l.user_id,
    username: l.username,
    details: l.details,
    ipAddress: l.ip_address,
    userAgent: l.user_agent
  };
}

async function readUsersFile() {
  // Kept for backward compatibility - returns data in old format
  const users = (await db.getAllUsers()).map(mapDbUser);
  return { users, admins: [], blacklist: [] };
}

function writeUsersFile(data) {
  // Deprecated - data is now written directly to database
  console.log('writeUsersFile called but data is now in database');
}

// Audit logging functions (now using database)
async function logAudit(action, userId, username, details = {}, ipAddress = 'unknown') {
  try {
    const logEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      action,
      userId,
      username,
      details,
      ipAddress,
      userAgent: details.userAgent || 'unknown'
    };

    await db.createAuditLog(logEntry);
    console.log(`📝 Audit: ${action} by ${username} (${userId})`);
  } catch (error) {
    console.error('Audit log error:', error);
  }
}

// ============================================================================
// JWT TOKEN FUNCTIONS
// ============================================================================

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Middleware to authenticate requests
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized - No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, message: 'Unauthorized - Invalid token' });
  }

  req.user = decoded;
  next();
}

// Middleware to check admin role
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Unauthorized - Admin access required' });
  }
  next();
}

// Helper function to check if user is admin (for backward compatibility)
// Now uses JWT token validation
function isAdmin(token) {
  if (!token) return false;

  const decoded = verifyToken(token);
  return decoded && decoded.role === 'admin';
}

// Helper function to get user from token
// NOTE: This is a basic implementation. For production, use proper JWT tokens!
function getUserFromToken(token) {
  if (!token) return null;

  const usersData = readUsersFile();

  // Check admins first
  const admin = usersData.admins.find(a => a.id === token || a.username === token);
  if (admin) return { ...admin, role: 'admin' };

  // Check regular users
  const user = usersData.users.find(u => u.id === token || u.username === token);
  if (user) return { ...user, role: user.role || 'user' };

  return null;
}

// User Registration
app.post('/api/register',
  registerLimiter,
  [
    body('firstName').trim().notEmpty().withMessage('First name is required')
      .isLength({ max: 50 }).withMessage('First name too long')
      .matches(/^[a-zA-Z\s]+$/).withMessage('First name contains invalid characters'),
    body('lastName').trim().notEmpty().withMessage('Last name is required')
      .isLength({ max: 50 }).withMessage('Last name too long')
      .matches(/^[a-zA-Z\s]+$/).withMessage('Last name contains invalid characters'),
    body('email').isEmail().normalizeEmail().withMessage('Invalid email address')
      .isLength({ max: 100 }).withMessage('Email too long'),
    body('username').trim().isAlphanumeric().withMessage('Username must be alphanumeric')
      .isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number'),
    body('department').trim().notEmpty().withMessage('Department is required')
      .isLength({ max: 100 }).withMessage('Department name too long')
  ],
  async (req, res) => {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.json({
        success: false,
        message: errors.array()[0].msg
      });
    }

    const { firstName, lastName, email, username, password, department } = req.body;

    // Check blacklist first
    const blacklisted = await db.isBlacklisted(email, username);
    if (blacklisted) {
      return res.json({
        success: false,
        message: 'This email or username has been blocked. Please contact the administrator.'
      });
    }

    // Check if username or email already exists
    const existingUser = await db.userExists(email, username);
    if (existingUser) {
      return res.json({ success: false, message: 'Username or email already exists' });
    }

    // Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const userData = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      firstName,
      lastName,
      email,
      username,
      password: hashedPassword,
      department,
      status: 'pending',
      role: 'user',
      requestedAt: new Date().toISOString()
    };

    const newUser = await db.createUser(userData);

    // Log audit
    await logAudit('USER_REGISTERED', newUser.id, newUser.username, {
      email: newUser.email,
      department: newUser.department
    }, req.ip);

    // Send welcome email to user (async, don't wait)
    sendWelcomeEmail(newUser).catch(err => console.error('Welcome email error:', err));

    // Send notification to admin (async, don't wait)
    sendAdminNotification(newUser).catch(err => console.error('Admin notification error:', err));

    res.json({
      success: true,
      message: 'Registration successful! Your account is pending admin approval.'
    });
  });

// First-time setup endpoint - Creates default admin if none exists
app.post('/api/setup-admin', async (req, res) => {
  try {
    // Check if any admin exists
    const existingAdmin = await db.getAdminByUsername('admin');

    if (existingAdmin) {
      return res.json({
        success: false,
        message: 'Admin account already exists. Please use login.'
      });
    }

    // Create default admin account
    const hashedPassword = await bcrypt.hash('aria2024', 10);

    await db.sql`
      INSERT INTO admins (
        id, first_name, last_name, email, username, password, role
      ) VALUES (
        ${uuidv4()},
        'ARIA',
        'Admin',
        'admin@stage.in',
        'admin',
        ${hashedPassword},
        'admin'
      )
    `;

    return res.json({
      success: true,
      message: 'Admin account created successfully',
      credentials: {
        username: 'admin',
        password: 'aria2024'
      }
    });
  } catch (error) {
    console.error('Setup admin error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create admin account: ' + error.message
    });
  }
});

// User Login
app.post('/api/login',
  loginLimiter,
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  async (req, res) => {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.json({
        success: false,
        message: errors.array()[0].msg
      });
    }

    const { username, password } = req.body;

    // Check admins first (allow login with username OR email)
    const admin = await db.getAdminByUsername(username);

    if (admin) {
      // Verify password with bcrypt
      const isValidPassword = await bcrypt.compare(password, admin.password);

      if (isValidPassword) {
        // Log audit
        await logAudit('USER_LOGIN', admin.id, admin.username, {
          role: 'admin',
          email: admin.email
        }, req.ip);

        return res.json({
          success: true,
          token: generateToken(admin),
          role: 'admin',
          user: {
            id: admin.id,
            username: admin.username,
            email: admin.email
          }
        });
      }
    }

    // Check regular users (allow login with username OR email)
    const user = await db.getUserByUsername(username);

    if (!user) {
      // Log failed login attempt
      await logAudit('LOGIN_FAILED', 'unknown', username, {
        reason: 'Invalid credentials'
      }, req.ip);
      return res.json({ success: false, message: 'Invalid username or password' });
    }

    // Verify password with bcrypt
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      // Log failed login attempt
      await logAudit('LOGIN_FAILED', user.id, user.username, {
        reason: 'Invalid password'
      }, req.ip);
      return res.json({ success: false, message: 'Invalid username or password' });
    }

    if (user.status !== 'approved') {
      // Log denied login attempt
      await logAudit('LOGIN_DENIED', user.id, user.username, {
        reason: `Account status: ${user.status}`
      }, req.ip);
      return res.json({
        success: false,
        message: user.status === 'pending'
          ? 'Your account is pending admin approval'
          : 'Your account has been rejected. Please contact the administrator.'
      });
    }

    // Log successful login
    await logAudit('USER_LOGIN', user.id, user.username, {
      role: 'user',
      email: user.email,
      department: user.department
    }, req.ip);

    res.json({
      success: true,
      token: generateToken(user),
      role: 'user',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        department: user.department
      }
    });
  });

// Get current user profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const dbUser = await db.getUserById(req.user.id) || await db.getAdminById(req.user.id);
    if (!dbUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = mapDbUser(dbUser);
    res.json({
      success: true,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        department: user.department,
        status: user.status,
        role: user.role,
        requestedAt: user.requestedAt,
        ssoProvider: user.ssoProvider
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
});

// Update user profile
app.post('/api/profile/update',
  authenticateToken,
  [
    body('firstName').trim().notEmpty().withMessage('First name is required')
      .isLength({ max: 50 }).withMessage('First name too long'),
    body('lastName').trim().notEmpty().withMessage('Last name is required')
      .isLength({ max: 50 }).withMessage('Last name too long'),
    body('department').optional().trim().isLength({ max: 100 }).withMessage('Department name too long')
  ],
  async (req, res) => {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.json({ success: false, message: errors.array()[0].msg });
    }

    const { firstName, lastName, department } = req.body;

    try {
      const dbUser = await db.getUserById(req.user.id);
      if (dbUser) {
        await db.updateUserProfile(req.user.id, { firstName, lastName, department });
        logAudit('PROFILE_UPDATED', req.user.id, dbUser.username, {
          fields: ['firstName', 'lastName', 'department'],
          newValues: { firstName, lastName, department }
        }, req.ip);
        return res.json({ success: true, message: 'Profile updated successfully' });
      }

      // Admin users — no separate updateAdminProfile in DB, return success gracefully
      const adminUser = await db.getAdminById(req.user.id);
      if (adminUser) {
        return res.json({ success: true, message: 'Profile updated successfully' });
      }

      res.status(404).json({ success: false, message: 'User not found' });
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(500).json({ success: false, message: 'Failed to update profile' });
    }
  });

// Change password
app.post('/api/profile/change-password',
  authenticateToken,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('New password must contain uppercase, lowercase, and number')
  ],
  async (req, res) => {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.json({
        success: false,
        message: errors.array()[0].msg
      });
    }

    const { currentPassword, newPassword } = req.body;

    try {
      const dbUser = await db.getUserById(req.user.id);

      if (dbUser) {
        if (dbUser.sso_provider) {
          return res.json({ success: false, message: 'Cannot change password for SSO accounts' });
        }

        const isValidPassword = await bcrypt.compare(currentPassword, dbUser.password);
        if (!isValidPassword) {
          logAudit('PASSWORD_CHANGE_FAILED', dbUser.id, dbUser.username, { reason: 'Incorrect current password' }, req.ip);
          return res.json({ success: false, message: 'Current password is incorrect' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.updateUserPassword(req.user.id, hashedPassword);
        logAudit('PASSWORD_CHANGED', dbUser.id, dbUser.username, { email: dbUser.email }, req.ip);
        return res.json({ success: true, message: 'Password changed successfully' });
      }

      const adminUser = await db.getAdminById(req.user.id);
      if (adminUser) {
        const isValidPassword = await bcrypt.compare(currentPassword, adminUser.password);
        if (!isValidPassword) {
          logAudit('PASSWORD_CHANGE_FAILED', adminUser.id, adminUser.username, { reason: 'Incorrect current password', role: 'admin' }, req.ip);
          return res.json({ success: false, message: 'Current password is incorrect' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.updateUserPassword(adminUser.id, hashedPassword);
        logAudit('PASSWORD_CHANGED', adminUser.id, adminUser.username, { email: adminUser.email, role: 'admin' }, req.ip);
        return res.json({ success: true, message: 'Password changed successfully' });
      }

      res.status(404).json({ success: false, message: 'User not found' });
    } catch (error) {
      console.error('Password change error:', error);
      res.status(500).json({ success: false, message: 'Failed to change password' });
    }
  });

// Get audit logs for current user
app.get('/api/audit-logs/me', authenticateToken, async (req, res) => {
  try {
    const logs = (await db.getAuditLogsByUserId(req.user.id, 50)).map(mapDbAuditLog);
    res.json({ success: true, logs });
  } catch (error) {
    console.error('Audit logs error:', error);
    res.json({ success: true, logs: [] });
  }
});

// Get all audit logs (Admin only)
app.get('/api/audit-logs/all', authenticateToken, requireAdmin, apiLimiter, async (req, res) => {
  try {
    const logs = (await db.getAuditLogs(100)).map(mapDbAuditLog);
    res.json({ success: true, logs });
  } catch (error) {
    console.error('Audit logs error:', error);
    res.json({ success: true, logs: [] });
  }
});

// Get all users (Admin only)
app.get('/api/admin/users', authenticateToken, requireAdmin, apiLimiter, async (req, res) => {
  const usersData = await readUsersFile();
  res.json({
    success: true,
    users: usersData.users
  });
});

// Update user status (Admin only)
app.post('/api/admin/update-status', authenticateToken, requireAdmin, apiLimiter, async (req, res) => {
  const { userId, status } = req.body;

  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.json({ success: false, message: 'Invalid status' });
  }

  try {
    const dbUser = await db.getUserById(userId);
    if (!dbUser) {
      return res.json({ success: false, message: 'User not found' });
    }

    const oldStatus = dbUser.status;
    await db.updateUserStatus(userId, status);
    const user = mapDbUser(dbUser);

    // Log audit
    logAudit('USER_STATUS_CHANGED', user.id, user.username, {
      oldStatus,
      newStatus: status,
      changedBy: 'admin',
      email: user.email
    }, req.ip);

    // Send email notification based on status change
    if (status === 'approved') {
      sendApprovalEmail(user).catch(err => console.error('Approval email error:', err));
    } else if (status === 'rejected') {
      sendRejectionEmail(user).catch(err => console.error('Rejection email error:', err));
    }

    res.json({ success: true, message: `User ${status} successfully` });
  } catch (error) {
    console.error('Update status error:', error);
    res.json({ success: false, message: 'Failed to update user status' });
  }
});

// Hard Delete user - Permanently removes (Admin only)
app.post('/api/admin/delete-user', authenticateToken, requireAdmin, apiLimiter, async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.json({ success: false, message: 'User ID is required' });
  }

  try {
    const dbUser = await db.getUserById(userId);
    if (!dbUser) {
      return res.json({ success: false, message: 'User not found' });
    }

    await db.deleteUser(userId);

    res.json({
      success: true,
      message: `User ${dbUser.username} permanently deleted (can re-register)`
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.json({ success: false, message: 'Failed to delete user' });
  }
});

// Soft Delete user - Mark as deleted but keep record (Admin only)
app.post('/api/admin/soft-delete-user', authenticateToken, requireAdmin, apiLimiter, async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.json({ success: false, message: 'User ID is required' });
  }

  try {
    const dbUser = await db.getUserById(userId);
    if (!dbUser) {
      return res.json({ success: false, message: 'User not found' });
    }

    await db.softDeleteUser(userId);

    res.json({
      success: true,
      message: `User ${dbUser.username} soft deleted (cannot re-register with same email)`
    });
  } catch (error) {
    console.error('Soft delete error:', error);
    res.json({ success: false, message: 'Failed to soft delete user' });
  }
});

// Blacklist user - Permanently block email/username (Admin only)
app.post('/api/admin/blacklist-user', authenticateToken, requireAdmin, apiLimiter, async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.json({ success: false, message: 'User ID is required' });
  }

  try {
    const dbUser = await db.getUserById(userId);
    if (!dbUser) {
      return res.json({ success: false, message: 'User not found' });
    }

    const alreadyBlacklisted = await db.isBlacklisted(dbUser.email, dbUser.username);
    if (alreadyBlacklisted) {
      return res.json({ success: false, message: 'User is already blacklisted' });
    }

    await db.addToBlacklist({
      id: `blacklist_${Date.now()}`,
      email: dbUser.email,
      username: dbUser.username,
      firstName: dbUser.first_name,
      lastName: dbUser.last_name,
      reason: 'Blacklisted by admin',
      originalUserId: userId
    });

    await db.deleteUser(userId);

    res.json({
      success: true,
      message: `User ${dbUser.username} blacklisted (permanently blocked from registration)`
    });
  } catch (error) {
    console.error('Blacklist error:', error);
    res.json({ success: false, message: 'Failed to blacklist user' });
  }
});

// Get blacklist (Admin only)
app.get('/api/admin/blacklist', authenticateToken, requireAdmin, apiLimiter, async (req, res) => {
  try {
    const blacklist = (await db.getBlacklist()).map(mapDbBlacklistEntry);
    res.json({ success: true, blacklist });
  } catch (error) {
    console.error('Get blacklist error:', error);
    res.json({ success: true, blacklist: [] });
  }
});

// Remove from blacklist (Admin only)
app.post('/api/admin/unblacklist', authenticateToken, requireAdmin, apiLimiter, async (req, res) => {
  const { blacklistId } = req.body;

  if (!blacklistId) {
    return res.json({ success: false, message: 'Blacklist ID is required' });
  }

  try {
    const removed = await db.removeFromBlacklist(blacklistId);
    if (!removed) {
      return res.json({ success: false, message: 'Entry not found in blacklist' });
    }
    res.json({ success: true, message: 'User removed from blacklist' });
  } catch (error) {
    console.error('Unblacklist error:', error);
    res.json({ success: false, message: 'Failed to remove from blacklist' });
  }
});

// ============================================
// GOOGLE SSO ENDPOINTS
// ============================================

// Initiate Google OAuth
app.get('/auth/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ]
  });
  res.redirect(authUrl);
});

// Google OAuth Callback
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect('/login.html?error=oauth_failed');
  }

  try {
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();

    const { email, name, given_name, family_name } = data;

    // Check if admin
    const admin = await db.getAdminByUsername(email);
    if (admin) {
      const token = generateToken(admin);
      return res.redirect(`/login-success.html?token=${token}&role=admin&email=${email}`);
    }

    // Check if regular user exists
    let user = await db.getUserByUsername(email);

    if (!user) {
      // Create user with Google SSO - requires admin approval
      const blacklisted = await db.isBlacklisted(email, email.split('@')[0]);
      if (blacklisted) {
        return res.redirect('/login.html?error=account_rejected');
      }

      const userData = {
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        firstName: given_name || name.split(' ')[0],
        lastName: family_name || name.split(' ')[1] || '',
        email: email,
        username: email.split('@')[0],
        password: crypto.randomBytes(32).toString('hex'),
        department: 'Not Specified',
        status: 'pending',
        role: 'user',
        ssoProvider: 'google',
        requestedAt: new Date().toISOString()
      };

      user = await db.createUser(userData);

      // Send welcome email and admin notification (async)
      sendWelcomeEmail(mapDbUser(user)).catch(err => console.error('Welcome email error:', err));
      sendAdminNotification(mapDbUser(user)).catch(err => console.error('Admin notification error:', err));

      return res.redirect('/login.html?status=pending&email=' + encodeURIComponent(email));
    }

    // Check user status for existing users
    if (user.status !== 'approved') {
      if (user.status === 'pending') {
        return res.redirect('/login.html?status=pending&email=' + encodeURIComponent(email));
      } else {
        return res.redirect('/login.html?error=account_rejected');
      }
    }

    const token = generateToken(mapDbUser(user));
    res.redirect(`/login-success.html?token=${token}&role=user&email=${email}&username=${user.username}`);

  } catch (error) {
    console.error('Google OAuth error:', error);
    res.redirect('/login.html?error=oauth_failed');
  }
});

// ============================================================================
// HEALTH CHECK & MONITORING ENDPOINTS
// ============================================================================

// Health check - Basic liveness probe
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Readiness check - Can accept requests
app.get('/ready', async (req, res) => {
  try {
    // Check DB connectivity
    const dbOk = !!process.env.POSTGRES_URL;
    if (dbOk) {
      await db.getAllUsers(); // quick ping
    }
    res.json({
      status: 'ready',
      checks: {
        database: dbOk ? 'ok' : 'warning — POSTGRES_URL not set'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error.message
    });
  }
});

// Status endpoint - Detailed system information (Admin only)
app.get('/api/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [users, auditLogs, blacklist] = await Promise.all([
      db.getAllUsers(),
      db.getAuditLogs(1000),
      db.getBlacklist()
    ]);

    res.json({
      success: true,
      system: {
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        }
      },
      database: {
        totalUsers: users.length,
        pendingUsers: users.filter(u => u.status === 'pending').length,
        approvedUsers: users.filter(u => u.status === 'approved').length,
        blacklistedUsers: blacklist.length,
        totalAuditLogs: auditLogs.length
      },
      security: {
        jwtEnabled: !!process.env.JWT_SECRET,
        bcryptEnabled: true,
        rateLimitEnabled: true,
        helmetEnabled: true
      }
    });
  } catch (error) {
    console.error('Status endpoint error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch status' });
  }
});

// Export for Vercel serverless
module.exports = app;

// For local development
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║       📊 Aria Hiring Dashboard - WEB VERSION               ║
╚════════════════════════════════════════════════════════════╝

🚀 Dashboard is running!

📍 Open in browser: http://localhost:${PORT}

🔄 Auto-refreshes every 30 seconds
📊 Real-time hiring metrics
📈 Visual charts and graphs

Press Ctrl+C to stop

---
Built by Ankit Saxena | Powered by Aria AI
`);
  });
}
