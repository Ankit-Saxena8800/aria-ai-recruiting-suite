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
require('dotenv').config();

const app = express();

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
const upload = multer({
  dest: 'uploads/',
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
app.use(express.static('public'));

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

    const SCREENING_PROMPT = `You are an expert technical recruiter with 15+ years of experience screening candidates.

Your task is to evaluate a candidate's resume against a job description and provide a comprehensive assessment.

Provide your analysis in this EXACT format:

## 🎯 OVERALL SCORE: [0-100]

## ✅ STRENGTHS (Top 3-5)
- [Specific strength with evidence from resume]

## ⚠️ WEAKNESSES/GAPS (Top 3-5)
- [Specific gap or concern with evidence]

## 💼 RELEVANT EXPERIENCE
- [Key relevant experiences that match the JD]

## 🎓 EDUCATION & CERTIFICATIONS
- [Relevant education and certifications]

## 🛠️ TECHNICAL SKILLS MATCH
| Required Skill | Candidate Level | Evidence |
|----------------|-----------------|----------|
| [Skill]        | [0-10]         | [Where in resume] |

## 🚩 RED FLAGS
- [Any concerns: job hopping, skill gaps, inconsistencies, etc.]

## 💡 HIRING RECOMMENDATION
**[STRONG YES / YES / MAYBE / NO / STRONG NO]**

Provide detailed, specific feedback. Be thorough but concise.`;

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

    const SCREENING_PROMPT = `You are an expert technical recruiter with 15+ years of experience screening candidates.

Your task is to evaluate a candidate's resume against a job description and provide a comprehensive assessment.

Provide your analysis in this EXACT format:

## 🎯 OVERALL SCORE: [0-100]

## ✅ STRENGTHS (Top 3-5)
- [Specific strength with evidence from resume]

## ⚠️ WEAKNESSES/GAPS (Top 3-5)
- [Specific gap or concern with evidence]

## 💼 RELEVANT EXPERIENCE
- [Key relevant experiences that match the JD]

## 🎓 EDUCATION & CERTIFICATIONS
- [Relevant education and certifications]

## 🛠️ TECHNICAL SKILLS MATCH
| Required Skill | Candidate Level | Evidence |
|----------------|-----------------|----------|
| [Skill]        | [0-10]         | [Where in resume] |

## 🚩 RED FLAGS
- [Any concerns: job hopping, skill gaps, inconsistencies, etc.]

## 💡 HIRING RECOMMENDATION
**[STRONG YES / YES / MAYBE / NO / STRONG NO]**

Provide detailed, specific feedback. Be thorough but concise.`;

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

    const INTERVIEW_PROMPT = `You are an expert interviewer and hiring manager with deep experience in conducting structured interviews.

Your task is to generate a comprehensive interview question bank with scoring rubrics for a given role.

Generate 20-30 well-structured questions across these sections:
- Warm-up & Culture Fit (5-8 questions)
- Technical/Domain Questions (10-15 questions)
- Scenario-Based/Problem-Solving (3-5 questions)
- Leadership/Behavioral (if applicable)

For each question, provide:
1. The question text
2. Why this question matters
3. What good answers include
4. Red flags to watch for
5. A 1-5 scoring rubric

Format your response clearly with sections and subsections. Be specific and actionable.`;

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

    const INTERVIEW_PROMPT = `You are an expert interviewer and hiring manager with deep experience in conducting structured interviews.

Your task is to generate a comprehensive interview question bank with scoring rubrics for a given role.

Generate 20-30 well-structured questions across these sections:
- Warm-up & Culture Fit (5-8 questions)
- Technical/Domain Questions (10-15 questions)
- Scenario-Based/Problem-Solving (3-5 questions)
- Leadership/Behavioral (if applicable)

For each question, provide:
1. The question text
2. Why this question matters
3. What good answers include
4. Red flags to watch for
5. A 1-5 scoring rubric

Format your response clearly with sections and subsections. Be specific and actionable.`;

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

// Helper functions for user management
function readUsersFile() {
  try {
    const data = fsSync.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { users: [], admins: [] };
  }
}

function writeUsersFile(data) {
  fsSync.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

// Audit logging functions
const AUDIT_LOG_FILE = path.join(__dirname, 'audit-logs.json');

function readAuditLogs() {
  try {
    const data = fsSync.readFileSync(AUDIT_LOG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { logs: [] };
  }
}

function writeAuditLogs(data) {
  fsSync.writeFileSync(AUDIT_LOG_FILE, JSON.stringify(data, null, 2));
}

function logAudit(action, userId, username, details = {}, ipAddress = 'unknown') {
  const auditData = readAuditLogs();

  const logEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    action,
    userId,
    username,
    details,
    ipAddress,
    userAgent: details.userAgent || 'unknown'
  };

  auditData.logs.unshift(logEntry); // Add to beginning for recent-first order

  // Keep only last 1000 logs to prevent file from growing too large
  if (auditData.logs.length > 1000) {
    auditData.logs = auditData.logs.slice(0, 1000);
  }

  writeAuditLogs(auditData);
  console.log(`📝 Audit: ${action} by ${username} (${userId})`);
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

    const usersData = readUsersFile();

    // Check blacklist first
    if (usersData.blacklist && usersData.blacklist.length > 0) {
      const isBlacklisted = usersData.blacklist.some(
        b => b.email === email || b.username === username
      );

      if (isBlacklisted) {
        return res.json({
          success: false,
          message: 'This email or username has been blocked. Please contact the administrator.'
        });
      }
    }

    // Check if username or email already exists (including soft-deleted)
    const existingUser = [...usersData.users, ...usersData.admins].find(
      u => u.username === username || u.email === email
    );

    if (existingUser) {
      if (existingUser.status === 'deleted') {
        return res.json({
          success: false,
          message: 'This account was previously deleted. Please contact the administrator to reactivate or use a different email.'
        });
      }
      return res.json({ success: false, message: 'Username or email already exists' });
    }

    // Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = {
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

    usersData.users.push(newUser);
    writeUsersFile(usersData);

    // Log audit
    logAudit('USER_REGISTERED', newUser.id, newUser.username, {
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

    const usersData = readUsersFile();

    // Check admins first (allow login with username OR email)
    const admin = usersData.admins.find(
      a => (a.username === username || a.email === username)
    );

    if (admin) {
      // Verify password with bcrypt
      const isValidPassword = await bcrypt.compare(password, admin.password);

      if (isValidPassword) {
        // Log audit
        logAudit('USER_LOGIN', admin.id, admin.username, {
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
    const user = usersData.users.find(
      u => (u.username === username || u.email === username)
    );

    if (!user) {
      // Log failed login attempt
      logAudit('LOGIN_FAILED', 'unknown', username, {
        reason: 'Invalid credentials'
      }, req.ip);
      return res.json({ success: false, message: 'Invalid username or password' });
    }

    // Verify password with bcrypt
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      // Log failed login attempt
      logAudit('LOGIN_FAILED', user.id, user.username, {
        reason: 'Invalid password'
      }, req.ip);
      return res.json({ success: false, message: 'Invalid username or password' });
    }

    if (user.status !== 'approved') {
      // Log denied login attempt
      logAudit('LOGIN_DENIED', user.id, user.username, {
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
    logAudit('USER_LOGIN', user.id, user.username, {
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
app.get('/api/profile', authenticateToken, (req, res) => {
  const usersData = readUsersFile();

  // Find user by ID from JWT token
  const user = [...usersData.users, ...usersData.admins].find(u => u.id === req.user.id);

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

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
  (req, res) => {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.json({
        success: false,
        message: errors.array()[0].msg
      });
    }

    const { firstName, lastName, department } = req.body;
    const usersData = readUsersFile();

    // Find user in users array
    const userIndex = usersData.users.findIndex(u => u.id === req.user.id);

    if (userIndex !== -1) {
      const user = usersData.users[userIndex];
      usersData.users[userIndex].firstName = firstName;
      usersData.users[userIndex].lastName = lastName;
      usersData.users[userIndex].department = department;
      usersData.users[userIndex].updatedAt = new Date().toISOString();

      writeUsersFile(usersData);

      // Log audit
      logAudit('PROFILE_UPDATED', user.id, user.username, {
        fields: ['firstName', 'lastName', 'department'],
        newValues: { firstName, lastName, department }
      }, req.ip);

      return res.json({
        success: true,
        message: 'Profile updated successfully'
      });
    }

    // Find user in admins array
    const adminIndex = usersData.admins.findIndex(u => u.id === req.user.id);

    if (adminIndex !== -1) {
      const admin = usersData.admins[adminIndex];
      usersData.admins[adminIndex].firstName = firstName || usersData.admins[adminIndex].firstName;
      usersData.admins[adminIndex].lastName = lastName || usersData.admins[adminIndex].lastName;
      usersData.admins[adminIndex].department = department;
      usersData.admins[adminIndex].updatedAt = new Date().toISOString();

      writeUsersFile(usersData);

      // Log audit
      logAudit('PROFILE_UPDATED', admin.id, admin.username, {
        fields: ['firstName', 'lastName', 'department'],
        newValues: { firstName, lastName, department },
        role: 'admin'
      }, req.ip);

      return res.json({
        success: true,
        message: 'Profile updated successfully'
      });
    }

    res.status(404).json({ success: false, message: 'User not found' });
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
    const usersData = readUsersFile();

    // Find user in users array
    const userIndex = usersData.users.findIndex(u => u.id === req.user.id);

    if (userIndex !== -1) {
      const user = usersData.users[userIndex];

      // Check if SSO user
      if (user.ssoProvider) {
        return res.json({ success: false, message: 'Cannot change password for SSO accounts' });
      }

      // Verify current password with bcrypt
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);

      if (!isValidPassword) {
        // Log failed attempt
        logAudit('PASSWORD_CHANGE_FAILED', user.id, user.username, {
          reason: 'Incorrect current password'
        }, req.ip);
        return res.json({ success: false, message: 'Current password is incorrect' });
      }

      // Hash new password with bcrypt
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password
      usersData.users[userIndex].password = hashedPassword;
      usersData.users[userIndex].updatedAt = new Date().toISOString();

      writeUsersFile(usersData);

      // Log audit
      logAudit('PASSWORD_CHANGED', user.id, user.username, {
        email: user.email
      }, req.ip);

      return res.json({
        success: true,
        message: 'Password changed successfully'
      });
    }

    // Find user in admins array
    const adminIndex = usersData.admins.findIndex(u => u.id === req.user.id);

    if (adminIndex !== -1) {
      const admin = usersData.admins[adminIndex];

      // Verify current password with bcrypt
      const isValidPassword = await bcrypt.compare(currentPassword, admin.password);

      if (!isValidPassword) {
        logAudit('PASSWORD_CHANGE_FAILED', admin.id, admin.username, {
          reason: 'Incorrect current password',
          role: 'admin'
        }, req.ip);
        return res.json({ success: false, message: 'Current password is incorrect' });
      }

      // Hash new password with bcrypt
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password
      usersData.admins[adminIndex].password = hashedPassword;
      usersData.admins[adminIndex].updatedAt = new Date().toISOString();

      writeUsersFile(usersData);

      // Log audit
      logAudit('PASSWORD_CHANGED', admin.id, admin.username, {
        email: admin.email,
        role: 'admin'
      }, req.ip);

      return res.json({
        success: true,
        message: 'Password changed successfully'
      });
    }

    res.status(404).json({ success: false, message: 'User not found' });
  });

// Get audit logs for current user
app.get('/api/audit-logs/me', authenticateToken, (req, res) => {
  const auditData = readAuditLogs();

  // Filter logs for this user only
  const userLogs = auditData.logs.filter(log => log.userId === req.user.id);

  res.json({
    success: true,
    logs: userLogs.slice(0, 50) // Return last 50 logs
  });
});

// Get all audit logs (Admin only)
app.get('/api/audit-logs/all', authenticateToken, requireAdmin, apiLimiter, (req, res) => {
  const auditData = readAuditLogs();

  res.json({
    success: true,
    logs: auditData.logs.slice(0, 100) // Return last 100 logs
  });
});

// Get all users (Admin only)
app.get('/api/admin/users', authenticateToken, requireAdmin, apiLimiter, (req, res) => {
  const usersData = readUsersFile();
  res.json({
    success: true,
    users: usersData.users
  });
});

// Update user status (Admin only)
app.post('/api/admin/update-status', authenticateToken, requireAdmin, apiLimiter, (req, res) => {
  const { userId, status } = req.body;

  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.json({ success: false, message: 'Invalid status' });
  }

  const usersData = readUsersFile();
  const userIndex = usersData.users.findIndex(u => u.id === userId);

  if (userIndex === -1) {
    return res.json({ success: false, message: 'User not found' });
  }

  const user = usersData.users[userIndex];
  const oldStatus = user.status;
  user.status = status;
  user.updatedAt = new Date().toISOString();

  writeUsersFile(usersData);

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

  res.json({
    success: true,
    message: `User ${status} successfully`
  });
});

// Hard Delete user - Permanently removes (Admin only)
app.post('/api/admin/delete-user', authenticateToken, requireAdmin, apiLimiter, (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.json({ success: false, message: 'User ID is required' });
  }

  const usersData = readUsersFile();
  const userIndex = usersData.users.findIndex(u => u.id === userId);

  if (userIndex === -1) {
    return res.json({ success: false, message: 'User not found' });
  }

  // Remove user from array (can re-register)
  const deletedUser = usersData.users[userIndex];
  usersData.users.splice(userIndex, 1);

  writeUsersFile(usersData);

  res.json({
    success: true,
    message: `User ${deletedUser.username} permanently deleted (can re-register)`
  });
});

// Soft Delete user - Mark as deleted but keep record (Admin only)
app.post('/api/admin/soft-delete-user', authenticateToken, requireAdmin, apiLimiter, (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.json({ success: false, message: 'User ID is required' });
  }

  const usersData = readUsersFile();
  const userIndex = usersData.users.findIndex(u => u.id === userId);

  if (userIndex === -1) {
    return res.json({ success: false, message: 'User not found' });
  }

  // Mark as deleted (keeps history, blocks re-registration)
  usersData.users[userIndex].status = 'deleted';
  usersData.users[userIndex].deletedAt = new Date().toISOString();

  writeUsersFile(usersData);

  res.json({
    success: true,
    message: `User ${usersData.users[userIndex].username} soft deleted (cannot re-register with same email)`
  });
});

// Blacklist user - Permanently block email/username (Admin only)
app.post('/api/admin/blacklist-user', authenticateToken, requireAdmin, apiLimiter, (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.json({ success: false, message: 'User ID is required' });
  }

  const usersData = readUsersFile();
  const user = usersData.users.find(u => u.id === userId);

  if (!user) {
    return res.json({ success: false, message: 'User not found' });
  }

  // Initialize blacklist if it doesn't exist
  if (!usersData.blacklist) {
    usersData.blacklist = [];
  }

  // Check if already blacklisted
  const alreadyBlacklisted = usersData.blacklist.some(
    b => b.email === user.email || b.username === user.username
  );

  if (alreadyBlacklisted) {
    return res.json({ success: false, message: 'User is already blacklisted' });
  }

  // Add to blacklist
  usersData.blacklist.push({
    id: `blacklist_${Date.now()}`,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    reason: 'Blacklisted by admin',
    blacklistedAt: new Date().toISOString(),
    originalUserId: userId
  });

  // Remove from users array
  const userIndex = usersData.users.findIndex(u => u.id === userId);
  usersData.users.splice(userIndex, 1);

  writeUsersFile(usersData);

  res.json({
    success: true,
    message: `User ${user.username} blacklisted (permanently blocked from registration)`
  });
});

// Get blacklist (Admin only)
app.get('/api/admin/blacklist', authenticateToken, requireAdmin, apiLimiter, (req, res) => {
  const usersData = readUsersFile();
  res.json({
    success: true,
    blacklist: usersData.blacklist || []
  });
});

// Remove from blacklist (Admin only)
app.post('/api/admin/unblacklist', authenticateToken, requireAdmin, apiLimiter, (req, res) => {
  const { blacklistId } = req.body;

  if (!blacklistId) {
    return res.json({ success: false, message: 'Blacklist ID is required' });
  }

  const usersData = readUsersFile();

  if (!usersData.blacklist) {
    return res.json({ success: false, message: 'No blacklist found' });
  }

  const index = usersData.blacklist.findIndex(b => b.id === blacklistId);

  if (index === -1) {
    return res.json({ success: false, message: 'Entry not found in blacklist' });
  }

  usersData.blacklist.splice(index, 1);
  writeUsersFile(usersData);

  res.json({
    success: true,
    message: 'User removed from blacklist'
  });
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

    // Check if user exists
    const usersData = readUsersFile();

    // Check if admin
    const admin = usersData.admins.find(a => a.email === email);
    if (admin) {
      const token = generateToken();
      return res.redirect(`/login-success.html?token=${token}&role=admin&email=${email}`);
    }

    // Check if regular user exists
    let user = usersData.users.find(u => u.email === email);

    if (!user) {
      // Create user with Google SSO - requires admin approval
      const username = email.split('@')[0];
      user = {
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        firstName: given_name || name.split(' ')[0],
        lastName: family_name || name.split(' ')[1] || '',
        email: email,
        username: username,
        password: generateToken(), // Random password for SSO users
        department: 'Not Specified',
        status: 'pending', // Require admin approval
        role: 'user',
        ssoProvider: 'google',
        requestedAt: new Date().toISOString()
      };

      usersData.users.push(user);
      writeUsersFile(usersData);

      // Send welcome email and admin notification (async)
      sendWelcomeEmail(user).catch(err => console.error('Welcome email error:', err));
      sendAdminNotification(user).catch(err => console.error('Admin notification error:', err));

      // Redirect to pending approval page
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

    const token = generateToken();
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
app.get('/ready', (req, res) => {
  try {
    // Check if users file exists and is readable
    const canRead = fsSync.existsSync('./users.json');
    const canWrite = canRead && fsSync.accessSync('./users.json', fsSync.constants.W_OK) === undefined;

    // Check if audit logs file exists
    const auditExists = fsSync.existsSync('./audit-logs.json');

    if (canRead && auditExists) {
      res.json({
        status: 'ready',
        checks: {
          usersFile: 'ok',
          auditLogs: 'ok',
          writable: canWrite ? 'ok' : 'warning'
        }
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        checks: {
          usersFile: canRead ? 'ok' : 'error',
          auditLogs: auditExists ? 'ok' : 'error'
        }
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error.message
    });
  }
});

// Status endpoint - Detailed system information (Admin only)
app.get('/api/status', authenticateToken, requireAdmin, (req, res) => {
  const usersData = readUsersFile();
  const auditData = readAuditLogs();

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
      totalUsers: usersData.users.length,
      totalAdmins: usersData.admins.length,
      pendingUsers: usersData.users.filter(u => u.status === 'pending').length,
      approvedUsers: usersData.users.filter(u => u.status === 'approved').length,
      blacklistedUsers: (usersData.blacklist || []).length,
      totalAuditLogs: auditData.logs.length
    },
    security: {
      jwtEnabled: !!process.env.JWT_SECRET,
      bcryptEnabled: true,
      rateLimitEnabled: true,
      helmetEnabled: true
    }
  });
});

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
