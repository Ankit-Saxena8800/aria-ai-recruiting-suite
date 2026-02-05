#!/usr/bin/env node
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const INTERVIEW_PROMPT = `You are an expert interviewer and hiring manager with deep experience in conducting structured interviews.

Your task is to generate a comprehensive interview question bank with scoring rubrics for a given role.

Provide your output in this EXACT format:

# Interview Question Bank: [Role Title]

## 📋 Interview Structure Recommendation
- **Total Duration:** [X minutes]
- **Phase 1 - Warm-up:** [X min] - Culture fit & behavioral
- **Phase 2 - Technical:** [X min] - Core technical skills
- **Phase 3 - Scenario:** [X min] - Problem-solving & judgment
- **Phase 4 - Candidate Questions:** [X min] - Their questions

---

## 🎯 SECTION 1: WARM-UP & CULTURE FIT (5-10 questions)

### Question 1: [Question text]
**Why ask this:** [Purpose of question]
**What to listen for:**
- ✅ Good answer includes: [criteria]
- ⚠️ Red flags: [concerns]

**Scoring Rubric (1-5):**
- **5 (Excellent):** [Description]
- **3 (Acceptable):** [Description]
- **1 (Poor):** [Description]

[Repeat for 5-10 questions]

---

## 💻 SECTION 2: TECHNICAL QUESTIONS (10-15 questions)

[Same format as above, but technical focus]

Include:
- Fundamental concepts
- Advanced/deep-dive questions
- Hands-on problem-solving
- System design (if applicable)

---

## 🧩 SECTION 3: SCENARIO-BASED QUESTIONS (5-7 questions)

[Same format, but real-world scenarios]

Include:
- Past experience examples (STAR method)
- Hypothetical situations
- Conflict resolution
- Leadership/collaboration scenarios

---

## ❓ SECTION 4: QUESTIONS CANDIDATES SHOULD ASK

Good candidates ask:
- [Example question 1 + why it's a good question]
- [Example question 2]

Red flags if they ask:
- [Example question + why it's concerning]

---

## 📊 OVERALL SCORING FRAMEWORK

| Dimension | Weight | Score (1-5) | Notes |
|-----------|--------|-------------|-------|
| Technical Skills | 40% | | |
| Problem-Solving | 25% | | |
| Culture Fit | 20% | | |
| Communication | 10% | | |
| Growth Mindset | 5% | | |

**Total Weighted Score:** [Calculate]

**Hiring Decision Threshold:**
- **90-100:** Strong Yes - Make offer immediately
- **75-89:** Yes - Proceed to next round
- **60-74:** Maybe - Additional round needed
- **Below 60:** No - Pass

---

Make questions specific to the role, not generic. Include follow-up questions and probing techniques.`;

async function generateInterviewQuestions(jobDescription, interviewType = 'comprehensive') {
  try {
    console.log('🤖 Aria is generating interview questions...\n');

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: INTERVIEW_PROMPT
    });

    const prompt = `
Job Description:
---
${jobDescription}
---

Interview Type: ${interviewType}

Generate a comprehensive interview question bank with scoring rubrics for this role.

${interviewType === 'technical' ? 'Focus heavily on technical questions (20-25 questions).' : ''}
${interviewType === 'behavioral' ? 'Focus heavily on behavioral and culture fit questions (15-20 questions).' : ''}
${interviewType === 'leadership' ? 'Focus on leadership, decision-making, and team management questions.' : ''}

Make questions specific and actionable.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

async function main() {
  if (process.argv.length < 3) {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║       🤖 Aria AI Interview Question Generator              ║
╚════════════════════════════════════════════════════════════╝

Usage:
  node interview-generator.js <job-description> [--type TYPE]

Options:
  --type TYPE    Interview focus (comprehensive, technical, behavioral, leadership)
  --file PATH    Read JD from file

Types:
  comprehensive  - Balanced mix (default)
  technical      - Heavy technical focus
  behavioral     - Culture fit & past behavior
  leadership     - Management & leadership skills

Examples:
  # Comprehensive interview
  node interview-generator.js "Senior Software Engineer with React, Node.js..."

  # Technical-focused
  node interview-generator.js "Backend Engineer..." --type technical

  # From file
  node interview-generator.js --file senior-pm-jd.txt --type behavioral
`);
    process.exit(1);
  }

  let jobDescription, interviewType = 'comprehensive';

  // Parse arguments
  if (process.argv[2] === '--file') {
    const fs = require('fs');
    jobDescription = fs.readFileSync(process.argv[3], 'utf8');
  } else {
    jobDescription = process.argv.slice(2).join(' ').split('--')[0].trim();
  }

  // Check for --type flag
  const typeIndex = process.argv.indexOf('--type');
  if (typeIndex !== -1 && process.argv[typeIndex + 1]) {
    interviewType = process.argv[typeIndex + 1];
  }

  if (!jobDescription || jobDescription.length < 30) {
    console.error('❌ Job description is too short. Please provide details.');
    process.exit(1);
  }

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       🤖 Aria AI Interview Question Generator              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`📝 Job Description: ${jobDescription.substring(0, 100)}...`);
  console.log(`🎯 Interview Type: ${interviewType}\n`);
  console.log('─'.repeat(60));

  try {
    const questions = await generateInterviewQuestions(jobDescription, interviewType);

    console.log('\n✅ Interview Questions Generated!\n');
    console.log('═'.repeat(60));
    console.log(questions);
    console.log('═'.repeat(60));

    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `interview-questions-${interviewType}-${timestamp}.md`;

    fs.writeFileSync(filename, questions, 'utf8');

    console.log(`\n💾 Questions saved to: ${filename}`);
    console.log('\n🚀 Next steps:');
    console.log('   1. Review and customize questions');
    console.log('   2. Share with interview panel');
    console.log('   3. Use scoring rubric during interview');
    console.log('   4. Calibrate scores across interviewers');
    console.log('\n🎯 Happy interviewing! - Aria 👩‍💼\n');

  } catch (error) {
    console.error('\n❌ Something went wrong:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateInterviewQuestions };
