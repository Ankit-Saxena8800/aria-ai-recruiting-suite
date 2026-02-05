# 🤖 Aria AI Candidate Sourcer

An AI-powered tool that generates comprehensive candidate sourcing strategies in seconds.

## What It Does

Give it a job description, and Aria generates:
- **Boolean Search Strings** (for Naukri, Indeed, Monster)
- **LinkedIn X-Ray Searches** (find passive candidates)
- **Candidate Profile Criteria** (must-haves, red flags, nice-to-haves)
- **Sourcing Strategy** (where to find candidates, how to attract them, which companies to target)

## Quick Start

```bash
# Basic usage
node candidate-sourcer.js "Your job description here..."

# From a file
node candidate-sourcer.js --file path/to/jd.txt

# Example
node candidate-sourcer.js "Senior Software Engineer with 5+ years in React, Node.js, AWS..."
```

## Examples

### Backend Engineer
```bash
node candidate-sourcer.js "Backend Engineer for video streaming platform.
Must have: Python, Django, video encoding/streaming protocols, AWS Media Services.
4+ years experience. Startup experience preferred."
```

### Product Manager
```bash
node candidate-sourcer.js "Product Manager for B2B SaaS.
MBA or equivalent, 3-5 years PM experience, strong analytics, user research,
worked with engineering teams in Agile environment."
```

### Data Scientist
```bash
node candidate-sourcer.js "Senior Data Scientist.
PhD or Masters in Statistics/CS, 5+ years ML/AI experience,
Python, TensorFlow, NLP, recommendation systems. OTT/media industry experience a plus."
```

## Output

Aria saves the strategy to a markdown file: `sourcing-strategy-[timestamp].md`

You can:
1. Copy-paste the Boolean strings directly into job portals
2. Use the X-ray searches on Google to find LinkedIn profiles
3. Follow the sourcing strategy to find candidates
4. Share the document with hiring managers

## Features

- ✅ AI-powered search string generation
- ✅ Industry-specific sourcing strategies
- ✅ Company intelligence (which companies to target)
- ✅ Outreach angle recommendations
- ✅ Red flag identification
- ✅ Saves results to markdown file

## Pro Tips

### 1. Be Specific in Your JD
The more detailed your job description, the better Aria's output.

**Good:**
> "Senior Frontend Engineer, 5+ years React, led teams of 3+, B2C product experience,
> startup environment, must have built high-traffic applications (1M+ users)"

**Not as good:**
> "Frontend Engineer with React experience"

### 2. Run Multiple Variations
Try different phrasings of the same role:
```bash
# Variation 1: Focus on skills
node candidate-sourcer.js "React expert, 5+ years..."

# Variation 2: Focus on outcomes
node candidate-sourcer.js "Engineer who has built and scaled web apps to 1M+ users..."

# Variation 3: Focus on company type
node candidate-sourcer.js "Startup engineer with full-stack experience..."
```

### 3. Combine with Manual Research
- Use Aria's search strings as a starting point
- Refine based on what you find
- Add company-specific keywords you discover

### 4. Track What Works
Keep a spreadsheet:
| Role | Search String Used | Source | Candidates Found | Hired |
|------|-------------------|--------|------------------|--------|
| Senior Engineer | Boolean V1 | Naukri | 25 | 1 |
| PM | X-ray V2 | LinkedIn | 15 | 0 |

## Roadmap

**Phase 1 (Current):**
- ✅ Generate sourcing strategies from JD

**Phase 2 (Next):**
- [ ] Direct integration with LinkedIn API
- [ ] Automated candidate scoring
- [ ] Bulk JD processing (process 10 JDs at once)

**Phase 3 (Future):**
- [ ] Integration with Slack (/aria-source command)
- [ ] Auto-save to Google Sheets
- [ ] Weekly sourcing report automation

## Built by Ankit Saxena
Senior Talent & People Partner @ STAGE

Using: Gemini AI, Node.js, Anthropic Claude Code

---

**Questions? Found a bug? Want a feature?**
Open an issue or reach out: ankitsaxena399@gmail.com
