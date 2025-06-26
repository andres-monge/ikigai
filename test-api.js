#!/usr/bin/env node

/**
 * Simple API testing script for Purpose Finder MVP
 * Tests the core assessment and action plan flow
 */

const BASE_URL = 'http://localhost:5000';
const TEST_SESSION_ID = `test-${Date.now()}`;

// Sample questionnaire data
const sampleResponses = {
  passions: [
    { question: "What activities make you lose track of time?", answer: "Building web applications and solving coding challenges" },
    { question: "What topics do you research in your free time?", answer: "JavaScript frameworks and AI development" }
  ],
  skills: [
    { question: "What do friends ask you for help with?", answer: "Technical problems and website building" },
    { question: "What comes naturally to you?", answer: "Breaking down complex problems into simple steps" }
  ],
  values: [
    { question: "What kind of work environment energizes you?", answer: "Remote-first teams working on innovative products" },
    { question: "What impact do you want to make?", answer: "Help small businesses succeed through better technology" }
  ],
  economic: [
    { question: "What salary range would meet your needs?", answer: "$75,000 - $120,000 per year" },
    { question: "How important is job security vs. growth potential?", answer: "Growth potential is more important to me" }
  ]
};

async function makeRequest(endpoint, data = null, timeout = 60000) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method: data ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined
  };

  console.log(`\n🔍 Testing ${options.method} ${endpoint}`);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    
    const responseData = await response.json();
    
    if (!response.ok) {
      console.error(`❌ Failed: ${response.status} ${response.statusText}`);
      console.error('Error details:', responseData);
      return null;
    }
    
    console.log(`✅ Success: ${response.status}`);
    return responseData;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`❌ Request timed out after ${timeout/1000}s`);
    } else {
      console.error(`❌ Request failed:`, error.message);
    }
    return null;
  }
}

async function testAssessmentFlow() {
  console.log('🚀 Starting Purpose Finder API Tests');
  console.log(`📝 Test Session ID: ${TEST_SESSION_ID}\n`);

  // Test 1: Submit questionnaire for analysis
  console.log('=== Test 1: Assessment Analysis ===');
  const analysisData = {
    sessionId: TEST_SESSION_ID,
    language: 'en',
    responses: sampleResponses
  };
  
  const analysisResult = await makeRequest('/api/analyze', analysisData, 90000); // 90s timeout for AI processing
  
  if (!analysisResult) {
    console.log('\n❌ Assessment analysis failed - cannot proceed with further tests');
    return false;
  }

  // Validate analysis result structure
  if (!analysisResult.purposePaths || !Array.isArray(analysisResult.purposePaths)) {
    console.error('❌ Analysis result missing purposePaths array');
    return false;
  }

  if (analysisResult.purposePaths.length === 0) {
    console.error('❌ No purpose paths generated');
    return false;
  }

  console.log(`✅ Generated ${analysisResult.purposePaths.length} purpose paths`);
  console.log(`✅ Core drivers analysis: ${analysisResult.coreDriversAnalysis ? 'Present' : 'Missing'}`);

  // Test 2: Generate action plan for first path
  console.log('\n=== Test 2: Action Plan Generation ===');
  const firstPathId = analysisResult.purposePaths[0].id;
  const actionPlanData = {
    sessionId: TEST_SESSION_ID,
    chosenPathId: firstPathId
  };

  const actionPlanResult = await makeRequest('/api/action-plan', actionPlanData, 90000);
  
  if (!actionPlanResult) {
    console.log('❌ Action plan generation failed');
    return false;
  }

  // Validate action plan structure
  if (!actionPlanResult.actionPlan) {
    console.error('❌ Action plan missing from result');
    return false;
  }

  const plan = actionPlanResult.actionPlan;
  const hasSkills = plan.skillsToLearn && Array.isArray(plan.skillsToLearn);
  const hasProjects = plan.sideProjectIdeas && Array.isArray(plan.sideProjectIdeas);
  const hasNetworking = plan.peopleToNetworkWith && Array.isArray(plan.peopleToNetworkWith);

  console.log(`✅ Skills to learn: ${hasSkills ? plan.skillsToLearn.length : 'Missing'}`);
  console.log(`✅ Project ideas: ${hasProjects ? plan.sideProjectIdeas.length : 'Missing'}`);
  console.log(`✅ Networking suggestions: ${hasNetworking ? plan.peopleToNetworkWith.length : 'Missing'}`);

  return hasSkills && hasProjects && hasNetworking;
}

async function testChatEndpoint() {
  console.log('\n=== Test 3: Chat Endpoint (Basic Check) ===');
  
  const chatData = {
    sessionId: TEST_SESSION_ID,
    message: "What's the most important first step?",
    language: 'en'
  };

  // For SSE endpoint, just check if it responds without error
  try {
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatData)
    });

    if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
      console.log('✅ Chat endpoint responding with SSE stream');
      return true;
    } else {
      console.log(`❌ Chat endpoint returned: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Chat endpoint error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  const startTime = Date.now();
  
  try {
    const assessmentSuccess = await testAssessmentFlow();
    const chatSuccess = await testChatEndpoint();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n' + '='.repeat(50));
    console.log('🏁 TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`⏱️  Total time: ${duration}s`);
    console.log(`📊 Assessment flow: ${assessmentSuccess ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`💬 Chat endpoint: ${chatSuccess ? '✅ PASS' : '❌ FAIL'}`);
    
    if (assessmentSuccess && chatSuccess) {
      console.log('\n🎉 All core functionality is working correctly!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some issues detected - check the logs above');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Test runner crashed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Tests interrupted by user');
  process.exit(1);
});

runTests();