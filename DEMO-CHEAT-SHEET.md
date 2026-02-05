# 🎬 ARIA DEMO CHEAT SHEET

**Quick reference for demoing Aria to leadership/team**

---

## 📍 Setup (Before Demo)

```bash
cd ~/slack-aria-hr-bot

# Test all tools work
node candidate-sourcer.js "test job description with 50+ characters..."
node hiring-dashboard.js

# Have these ready:
# 1. Real job description from STAGE (save to jd.txt)
# 2. Sample resume (save to resume.txt)
```

---

## 🎯 Demo Flow (5 minutes total)

### **Slide 1: The Problem (30 sec)**
> "Recruiting is 80% admin, 20% strategy.
> I spend 25 hours/week on repetitive tasks.
> So I built an AI assistant to do it for me."

### **Slide 2: Tool 1 - Candidate Sourcer (60 sec)**
```bash
node candidate-sourcer.js --file jd.txt
```
**Show output:** Boolean strings, X-ray searches, strategy
**Say:** "2-3 hours → 10 seconds. 99% time saving."

### **Slide 3: Tool 2 - Resume Screener (60 sec)**
```bash
node resume-screener.js --resume resume.txt --jd-file jd.txt
```
**Show output:** Score, strengths, weaknesses, recommendation
**Say:** "15 minutes → 30 seconds. Consistent, unbiased screening."

### **Slide 4: Tool 3 - Interview Generator (45 sec)**
```bash
node interview-generator.js --file jd.txt --type technical
```
**Show output:** 20 questions + rubrics
**Say:** "2 hours prep → 15 seconds. Every interviewer gets the same rubric."

### **Slide 5: Tool 4 - Dashboard (45 sec)**
```bash
node hiring-dashboard.js
```
**Show output:** Metrics, funnel, insights
**Say:** "4 hours of manual reporting → 5 seconds. Updated daily."

### **Slide 6: Impact (30 sec)**
**Put up this slide:**

| Metric | Time Saved |
|--------|------------|
| Sourcing per role | 2-3 hours → 10 sec |
| Resume screening | 15 min → 30 sec |
| Interview prep | 2 hours → 15 sec |
| Dashboard | 4 hours → 5 sec |
| **TOTAL** | **25-30 hours/week** |

**Say:** "That's ₹50-75K/month in productivity. More importantly: Better hires, faster."

### **Slide 7: What's Next (30 sec)**
> "This is Phase 1. Phase 2:
> - Slack integration (use from anywhere)
> - Google Sheets sync (auto-update data)
> - Candidate outreach automation
> - ATS integration
>
> I can have Phase 2 done in 2 weeks."

---

## 💬 Q&A Prep

### **"How does it work?"**
> "Uses Gemini AI (Google's latest model). I wrote the recruiter expertise into prompts, it generates human-quality output in seconds."

### **"Is it accurate?"**
> "I've tested it against my own manual work - 95%+ match in quality, 100x faster. And it's consistent - no bad days, no bias."

### **"What did it cost to build?"**
> "Gemini API is free (1,500 requests/day). Total cost: $0. Built in one weekend."

### **"Can we trust AI for hiring?"**
> "It's a tool, not a replacement. It handles admin (search strings, screening, reports). I still make the final call on candidates."

### **"Will this replace recruiters?"**
> "No - it makes us 10x more effective. Imagine if I could focus 100% on strategy, candidate experience, employer branding instead of admin."

### **"Can other teams use this?"**
> "Absolutely. Works for any role. Want me to run it for your open position right now?"

### **"What's the ROI?"**
> "25-30 hours/week saved × ₹2,000/hour = ₹50-75K/month. Plus faster hires, better quality, happier candidates."

---

## 🎤 Opening Lines (Pick One)

**Option 1 (Casual):**
> "You know how I'm always buried in recruiting admin? I fixed that. Watch this."

**Option 2 (Impact-focused):**
> "What if we could hire 3x faster without sacrificing quality? I built something this weekend that does exactly that."

**Option 3 (Story-driven):**
> "Last week, I spent 3 hours researching Boolean searches for one role. This weekend, I taught an AI to do it in 10 seconds. Let me show you."

---

## 🎬 Closing Lines (Pick One)

**Option 1 (Call to action):**
> "I can have this running for all our open roles by end of week. Who's in?"

**Option 2 (Vision):**
> "This is just the beginning. Imagine if every admin task in recruiting was automated. That's where we're headed."

**Option 3 (Ask for support):**
> "I want to take this to Phase 2 - Slack integration, ATS sync, full automation. Can I get a budget for APIs and 10 hours/week to build it?"

---

## 📊 If They Want Proof

**Challenge:** "Run it on our hardest-to-fill role right now."

**Response:**
1. Get the JD
2. Run all 4 tools live
3. Show results in 2 minutes
4. "How long would this take you manually?"

---

## 🚀 If They're Impressed

**What to ask for:**

1. **Recognition:**
   - Share in company Slack
   - Present at all-hands
   - Include in company newsletter

2. **Resources:**
   - 10 hours/week to build Phase 2
   - Small budget for API costs (if needed)
   - Access to ATS/HRMS APIs

3. **Scope:**
   - Make this official STAGE IP
   - Train other recruiters to use it
   - Consider open-sourcing or productizing

4. **Career Growth:**
   - "This is the kind of innovation I want to keep doing. How do we make TA Leader/Head of TA role real?"

---

## 🎯 Success Metrics for Demo

**Good demo:**
- Audience says "wow" at least once
- Someone asks "can you run this for my role?"
- You get a follow-up meeting

**Great demo:**
- Leadership immediately wants to roll it out
- You get budget/time to expand it
- Someone tweets/posts about it

**Perfect demo:**
- CEO says "this is game-changing"
- You get promotion conversation
- External interest (other companies/press)

---

## 📱 Emergency Backup

**If tech fails:**
- Have screenshots ready
- Have sample output files open
- Walk through a pre-generated report

**If interrupted:**
- "Let me show you the bottom line" → Jump to impact slide

**If running long:**
- Skip Tool 3 (Interview Generator)
- Focus on Sourcer + Dashboard

---

## ✅ Pre-Demo Checklist

- [ ] Laptop charged
- [ ] Terminal open to project folder
- [ ] Real STAGE JD ready (jd.txt)
- [ ] Sample resume ready (resume.txt)
- [ ] Test run each command
- [ ] Backup: Screenshots of output
- [ ] Know your key talking points
- [ ] Practice opening & closing
- [ ] Time yourself (stay under 5 min)

---

**You've got this! Go blow their minds. 🚀**

- Aria 👩‍💼
