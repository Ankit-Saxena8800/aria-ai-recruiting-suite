const fs = require('fs');

// Read the base premium template
const base = fs.readFileSync('public/jd-generator.html', 'utf8');

// Pages config with their specific attributes
const pages = {
  'offer-letter': {
    title: 'Offer Letter Generator - Aria AI',
    heading: 'Offer Letter Generator',
    subtitle: 'Create professional offer letters',
    apiEndpoint: '/api/generate-offer',
    resultField: 'offer',
    icons: {
      default: '📜',
      compensation: '💰',
      dates: '📅',
      terms: '📋',
      details: '📝',
      benefits: '🎁'
    }
  },
  'salary': {
    title: 'Salary Benchmarking - Aria AI',
    heading: 'Salary Benchmarking',
    subtitle: 'Get market salary ranges and compensation insights',
    apiEndpoint: '/api/salary-benchmark',
    resultField: 'salary',
    icons: {
      default: '💰',
      range: '📊',
      market: '📈',
      data: '💹',
      comparison: '⚖️'
    }
  },
  'reference': {
    title: 'Reference Check - Aria AI',
    heading: 'Reference Check Generator',
    subtitle: 'Generate comprehensive reference check questions',
    apiEndpoint: '/api/reference-questions',
    resultField: 'questions',
    icons: {
      default: '❓',
      question: '📝',
      candidate: '👤',
      evaluation: '⭐',
      performance: '📊'
    }
  },
  'feedback': {
    title: 'Interview Feedback - Aria AI',
    heading: 'Interview Feedback Form Generator',
    subtitle: 'Create structured interview feedback forms',
    apiEndpoint: '/api/feedback-form',
    resultField: 'form',
    icons: {
      default: '⭐',
      rating: '📊',
      strengths: '💪',
      notes: '📝',
      recommendation: '🎯'
    }
  },
  'onboarding': {
    title: 'Onboarding Checklist - Aria AI',
    heading: 'Onboarding Checklist Generator',
    subtitle: 'Create comprehensive new hire onboarding checklists',
    apiEndpoint: '/api/onboarding-checklist',
    resultField: 'checklist',
    icons: {
      default: '✅',
      checklist: '☑️',
      timeline: '📅',
      tasks: '🎯',
      orientation: '👋',
      day1: '1️⃣'
    }
  }
};

console.log('Creating remaining premium pages...');
Object.keys(pages).forEach(key => {
  console.log(`✓ ${key}.html will use existing file or template`);
});

