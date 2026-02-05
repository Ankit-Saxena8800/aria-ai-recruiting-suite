#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');

/**
 * Aria Hiring Dashboard
 *
 * Generates hiring metrics and analytics from your recruitment data.
 *
 * Data source: Google Sheets, CSV, or JSON file
 * Output: Markdown report with metrics and charts
 */

// Sample data structure (you'll replace this with actual data from Google Sheets/ATS)
const sampleData = {
  openPositions: [
    { title: 'Senior Engineer', daysOpen: 45, applicants: 120, screened: 45, interviewed: 12, offered: 2 },
    { title: 'Product Manager', daysOpen: 30, applicants: 85, screened: 30, interviewed: 8, offered: 1 },
    { title: 'Designer', daysOpen: 60, applicants: 65, screened: 20, interviewed: 5, offered: 0 },
  ],
  closedPositions: [
    { title: 'Backend Engineer', timeToFill: 42, applicants: 150, hired: 1, offerAcceptance: 100 },
    { title: 'Frontend Engineer', timeToFill: 35, applicants: 95, hired: 1, offerAcceptance: 100 },
  ],
  pipeline: {
    totalApplicants: 515,
    screened: 140,
    interviewed: 30,
    offered: 3,
    hired: 2
  }
};

function calculateMetrics(data) {
  const { openPositions, closedPositions, pipeline } = data;

  // Time to fill
  const avgTimeToFill = closedPositions.length > 0
    ? Math.round(closedPositions.reduce((sum, pos) => sum + pos.timeToFill, 0) / closedPositions.length)
    : 0;

  // Conversion rates
  const screeningRate = pipeline.totalApplicants > 0
    ? Math.round((pipeline.screened / pipeline.totalApplicants) * 100)
    : 0;

  const interviewRate = pipeline.screened > 0
    ? Math.round((pipeline.interviewed / pipeline.screened) * 100)
    : 0;

  const offerRate = pipeline.interviewed > 0
    ? Math.round((pipeline.offered / pipeline.interviewed) * 100)
    : 0;

  const acceptanceRate = pipeline.offered > 0
    ? Math.round((pipeline.hired / pipeline.offered) * 100)
    : 0;

  // Quality of hire (simple version - can be enhanced)
  const qualityScore = Math.round((screeningRate + interviewRate + offerRate + acceptanceRate) / 4);

  return {
    avgTimeToFill,
    screeningRate,
    interviewRate,
    offerRate,
    acceptanceRate,
    qualityScore,
    openRoles: openPositions.length,
    closedRoles: closedPositions.length,
    totalApplicants: pipeline.totalApplicants,
    activeCandidates: pipeline.screened + pipeline.interviewed + pipeline.offered
  };
}

function generateTextChart(value, max = 100, width = 20) {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ` ${value}%`;
}

function generateDashboard(data) {
  const metrics = calculateMetrics(data);
  const timestamp = new Date().toLocaleString();

  return `# 📊 Aria Hiring Dashboard

**Generated:** ${timestamp}
**Period:** Last 30 days (customize in code)

---

## 🎯 KEY METRICS

| Metric | Value | Status |
|--------|-------|--------|
| **Open Positions** | ${metrics.openRoles} | ${metrics.openRoles > 5 ? '🔴 High' : '🟢 Normal'} |
| **Avg Time to Fill** | ${metrics.avgTimeToFill} days | ${metrics.avgTimeToFill > 45 ? '🔴 Slow' : '🟢 Good'} |
| **Active Candidates** | ${metrics.activeCandidates} | - |
| **Total Applicants** | ${metrics.totalApplicants} | - |

---

## 🔄 FUNNEL METRICS

### Application → Screening
${generateTextChart(metrics.screeningRate)}
*${metrics.screeningRate}% of applicants pass initial screening*

### Screening → Interview
${generateTextChart(metrics.interviewRate)}
*${metrics.interviewRate}% of screened candidates get interviewed*

### Interview → Offer
${generateTextChart(metrics.offerRate)}
*${metrics.offerRate}% of interviewed candidates receive offers*

### Offer → Acceptance
${generateTextChart(metrics.acceptanceRate)}
*${metrics.acceptanceRate}% of offers are accepted*

---

## 📈 QUALITY OF HIRE SCORE

${generateTextChart(metrics.qualityScore)}

**Score:** ${metrics.qualityScore}/100

${metrics.qualityScore >= 75 ? '✅ **Excellent** - Hiring process is healthy'
  : metrics.qualityScore >= 50 ? '⚠️ **Good** - Room for improvement'
  : '🔴 **Needs Attention** - Review hiring funnel'}

---

## 🚀 OPEN POSITIONS STATUS

${data.openPositions.map(pos => `
### ${pos.title}
- **Days Open:** ${pos.daysOpen} ${pos.daysOpen > 45 ? '🔴' : pos.daysOpen > 30 ? '🟡' : '🟢'}
- **Applicants:** ${pos.applicants}
- **Pipeline:** ${pos.screened} screened → ${pos.interviewed} interviewed → ${pos.offered} offered
- **Conversion:** ${pos.applicants > 0 ? Math.round((pos.offered / pos.applicants) * 100) : 0}%
`).join('\n')}

---

## ✅ RECENTLY CLOSED POSITIONS

${data.closedPositions.map(pos => `
- **${pos.title}:** Filled in ${pos.timeToFill} days | ${pos.applicants} applicants | Offer acceptance: ${pos.offerAcceptance}%
`).join('\n')}

---

## 💡 INSIGHTS & RECOMMENDATIONS

${generateInsights(metrics, data)}

---

## 📊 NEXT STEPS

1. **High Priority:**
   ${data.openPositions
     .filter(p => p.daysOpen > 45)
     .map(p => `- Accelerate hiring for **${p.title}** (${p.daysOpen} days open)`)
     .join('\n   ')
     || '- No urgent positions'}

2. **Optimization:**
   ${metrics.screeningRate < 20 ? '- Improve sourcing quality (screening rate low)'
     : metrics.interviewRate < 25 ? '- Review screening criteria (interview rate low)'
     : metrics.acceptanceRate < 70 ? '- Improve offer competitiveness (acceptance rate low)'
     : '- Maintain current efficiency'}

3. **Analytics:**
   - Track quality of hire metrics for new joiners
   - Survey candidates for feedback
   - Benchmark against industry standards

---

*Generated by Aria AI Recruiting Suite | Built by Ankit Saxena*
`;
}

function generateInsights(metrics, data) {
  const insights = [];

  // Time to fill
  if (metrics.avgTimeToFill > 45) {
    insights.push('🔴 **Time to fill is high** - Consider: faster screening, more sourcers, better job descriptions');
  } else if (metrics.avgTimeToFill < 30) {
    insights.push('🟢 **Excellent time to fill** - Hiring process is efficient');
  }

  // Funnel analysis
  if (metrics.screeningRate < 15) {
    insights.push('⚠️ **Low screening rate** - Improve sourcing quality or adjust JD requirements');
  }

  if (metrics.interviewRate < 20) {
    insights.push('⚠️ **Low interview rate** - Review screening criteria or train recruiters');
  }

  if (metrics.acceptanceRate < 70) {
    insights.push('🔴 **Low offer acceptance** - Salary not competitive? Long process? Candidate experience issues?');
  }

  // Open positions
  const stalledPositions = data.openPositions.filter(p => p.daysOpen > 60);
  if (stalledPositions.length > 0) {
    insights.push(`🔴 **${stalledPositions.length} position(s) open for 60+ days** - Review requirements or sourcing strategy`);
  }

  if (insights.length === 0) {
    insights.push('🟢 **Hiring metrics look healthy!** Keep up the good work.');
  }

  return insights.map((i, idx) => `${idx + 1}. ${i}`).join('\n');
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          📊 Aria Hiring Dashboard Generator                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('📝 Using sample data...');
  console.log('💡 To use real data: Connect to Google Sheets or export from ATS\n');
  console.log('─'.repeat(60));

  // TODO: Replace with actual data source
  // const data = await fetchFromGoogleSheets();
  // const data = await fetchFromATS();
  const data = sampleData;

  const dashboard = generateDashboard(data);

  console.log('\n✅ Dashboard Generated!\n');
  console.log('═'.repeat(60));
  console.log(dashboard);
  console.log('═'.repeat(60));

  // Save to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `hiring-dashboard-${timestamp}.md`;

  fs.writeFileSync(filename, dashboard, 'utf8');

  console.log(`\n💾 Dashboard saved to: ${filename}`);
  console.log('\n🚀 Next steps:');
  console.log('   1. Review metrics and insights');
  console.log('   2. Share with leadership');
  console.log('   3. Connect to real data source (Google Sheets/ATS)');
  console.log('   4. Automate daily/weekly reports');
  console.log('\n📊 Happy analyzing! - Aria 👩‍💼\n');
}

if (require.main === module) {
  main();
}

module.exports = { generateDashboard, calculateMetrics };
