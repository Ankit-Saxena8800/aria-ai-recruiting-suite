#!/usr/bin/env node
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

**Rationale:** [2-3 sentences explaining the recommendation]

**Next Steps:** [What to do - phone screen, technical test, pass, etc.]

---

Be honest, specific, and reference actual details from the resume. Don't be generic.`;

async function screenResume(resumeText, jobDescription) {
  try {
    console.log('🤖 Aria is analyzing the resume...\n');

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SCREENING_PROMPT
    });

    const result = await model.generateContent(`
Job Description:
---
${jobDescription}
---

Candidate Resume:
---
${resumeText}
---

Please evaluate this candidate against the job requirements and provide your assessment.
`);

    const response = await result.response;
    return response.text();

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Read resume file (supports txt, md, and extracts basic text from other formats)
function readResumeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(filePath, 'utf8');

  // For now, just read text files directly
  // TODO: Add PDF parsing with pdf-parse library
  return content;
}

async function main() {
  if (process.argv.length < 5 || !process.argv.includes('--resume') || !process.argv.includes('--jd')) {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║          🤖 Aria AI Resume Screener                        ║
╚════════════════════════════════════════════════════════════╝

Usage:
  node resume-screener.js --resume <resume-file> --jd <job-description>

Options:
  --resume <path>   Path to resume file (txt, md, pdf)
  --jd <text>       Job description (in quotes)
  --jd-file <path>  OR read JD from file

Examples:
  # With inline JD
  node resume-screener.js --resume candidate.txt --jd "Senior Engineer with React..."

  # With JD from file
  node resume-screener.js --resume candidate.txt --jd-file senior-engineer-jd.txt

  # Screen multiple resumes
  for resume in resumes/*.txt; do
    node resume-screener.js --resume "$resume" --jd-file jd.txt
  done
`);
    process.exit(1);
  }

  // Parse arguments
  let resumeFile, jobDescription;

  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--resume') {
      resumeFile = process.argv[i + 1];
    } else if (process.argv[i] === '--jd' && process.argv[i + 1] !== '--jd-file') {
      jobDescription = process.argv.slice(i + 1).join(' ').split('--')[0].trim();
      break;
    } else if (process.argv[i] === '--jd-file') {
      jobDescription = fs.readFileSync(process.argv[i + 1], 'utf8');
    }
  }

  if (!resumeFile || !jobDescription) {
    console.error('❌ Please provide both --resume and --jd (or --jd-file)');
    process.exit(1);
  }

  if (!fs.existsSync(resumeFile)) {
    console.error(`❌ Resume file not found: ${resumeFile}`);
    process.exit(1);
  }

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          🤖 Aria AI Resume Screener                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`📄 Resume: ${resumeFile}`);
  console.log(`📝 Job Description: ${jobDescription.substring(0, 80)}...\n`);
  console.log('─'.repeat(60));

  try {
    const resumeText = readResumeFile(resumeFile);

    if (resumeText.length < 100) {
      console.error('❌ Resume file seems too short or empty');
      process.exit(1);
    }

    const assessment = await screenResume(resumeText, jobDescription);

    console.log('\n✅ Resume Screening Complete!\n');
    console.log('═'.repeat(60));
    console.log(assessment);
    console.log('═'.repeat(60));

    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const candidateName = path.basename(resumeFile, path.extname(resumeFile));
    const filename = `screening-${candidateName}-${timestamp}.md`;

    fs.writeFileSync(filename, `# Resume Screening: ${candidateName}\n\n${assessment}`, 'utf8');

    console.log(`\n💾 Assessment saved to: ${filename}`);
    console.log('\n🚀 Next steps:');
    console.log('   1. Review the assessment');
    console.log('   2. Follow the recommendation (phone screen, technical test, or pass)');
    console.log('   3. Document decision in ATS');
    console.log('\n🎯 Happy hiring! - Aria 👩‍💼\n');

  } catch (error) {
    console.error('\n❌ Something went wrong:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { screenResume };
