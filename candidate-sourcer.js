#!/usr/bin/env node
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

async function generateSourcingStrategy(jobDescription) {
  try {
    console.log('🤖 Aria is analyzing the job description...\n');

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SOURCING_PROMPT
    });

    const result = await model.generateContent(`
Job Description:
---
${jobDescription}
---

Generate a comprehensive candidate sourcing strategy for this role.
`);

    const response = await result.response;
    return response.text();

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Main execution
async function main() {
  // Check if job description is provided
  if (process.argv.length < 3) {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║          🤖 Aria AI Candidate Sourcer                      ║
╚════════════════════════════════════════════════════════════╝

Usage: node candidate-sourcer.js "Your job description here"

Or: node candidate-sourcer.js --file path/to/jd.txt

Example:
  node candidate-sourcer.js "Senior Software Engineer with 5+ years experience in React, Node.js, and AWS. Must have led teams of 3+ engineers..."

Options:
  --file <path>  Read job description from a file
  --help         Show this help message
`);
    process.exit(1);
  }

  let jobDescription;

  // Read from file or command line argument
  if (process.argv[2] === '--file') {
    const fs = require('fs');
    const filePath = process.argv[3];

    if (!filePath) {
      console.error('❌ Please provide a file path');
      process.exit(1);
    }

    try {
      jobDescription = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.error(`❌ Could not read file: ${error.message}`);
      process.exit(1);
    }
  } else {
    jobDescription = process.argv.slice(2).join(' ');
  }

  if (!jobDescription || jobDescription.trim().length < 50) {
    console.error('❌ Job description is too short. Please provide a detailed JD (at least 50 characters).');
    process.exit(1);
  }

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          🤖 Aria AI Candidate Sourcer                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('📝 Job Description Preview:');
  console.log(jobDescription.substring(0, 200) + '...\n');
  console.log('─'.repeat(60));

  try {
    const strategy = await generateSourcingStrategy(jobDescription);

    console.log('\n✅ Sourcing Strategy Generated!\n');
    console.log('═'.repeat(60));
    console.log(strategy);
    console.log('═'.repeat(60));

    // Save to file
    const fs = require('fs');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `sourcing-strategy-${timestamp}.md`;

    fs.writeFileSync(filename, `# Candidate Sourcing Strategy\n\n${strategy}`, 'utf8');

    console.log(`\n💾 Strategy saved to: ${filename}`);
    console.log('\n🚀 Next steps:');
    console.log('   1. Review the Boolean search strings');
    console.log('   2. Copy-paste them into Naukri, LinkedIn, Indeed');
    console.log('   3. Start reaching out to candidates!');
    console.log('\n🎯 Happy sourcing! - Aria 👩‍💼\n');

  } catch (error) {
    console.error('\n❌ Something went wrong:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { generateSourcingStrategy };
