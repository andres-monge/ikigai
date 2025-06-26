#!/usr/bin/env node

/**
 * Simple API Test Script for Purpose Finder Application
 * Tests the core backend functionality implemented in steps 1-17
 */

const BASE_URL = 'http://localhost:5000';

// Test data matching the expected API schema
const testAnalyzeData = {
  sessionId: "test-session-" + Date.now(),
  language: "en",
  responses: {
    passions: [
      {
        question: "What specific activities make you forget to check the clock because you're so engaged?",
        answer: "Programming and building web applications, especially when solving complex problems"
      },
      {
        question: "What topics do you find yourself naturally gravitating toward in conversations or research?",
        answer: "Technology trends, software architecture, and user experience design"
      }
    ],
    skills: [
      {
        question: "What do others consistently ask for your help with?",
        answer: "Debugging code, explaining technical concepts, and project planning"
      },
      {
        question: "What tasks feel effortless to you but seem challenging to others?",
        answer: "Learning new programming languages and frameworks quickly"
      }
    ],
    values: [
      {
        question: "What causes or principles would you defend even if it meant personal sacrifice?",
        answer: "Open source software and accessible education for everyone"
      },
      {
        question: "What type of impact do you want your work to have on others or society?",
        answer: "Help democratize technology and make complex tools more accessible"
      }
    ],
    economic: [
      {
        question: "What lifestyle do you want your career to enable?",
        answer: "Remote work flexibility with financial stability and learning opportunities"
      },
      {
        question: "How important is financial security versus passion in your career decisions?",
        answer: "Need financial stability but passionate work is equally important for long-term satisfaction"
      }
    ]
  }
};

async function makeRequest(method, endpoint, data = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  try {
    const response = await fetch(url, options);
    const responseData = await response.text();
    
    let parsedData;
    try {
      parsedData = JSON.parse(responseData);
    } catch {
      parsedData = responseData;
    }
    
    return {
      status: response.status,
      data: parsedData,
      headers: Object.fromEntries(response.headers.entries())
    };
  } catch (error) {
    return {
      status: 'ERROR',
      data: error.message,
      headers: {}
    };
  }
}

async function testAnalyzeEndpoint() {
  console.log('\n=== Testing /api/analyze endpoint ===');
  
  const result = await makeRequest('POST', '/api/analyze', testAnalyzeData);
  
  console.log(`Status: ${result.status}`);
  console.log(`Response:`, JSON.stringify(result.data, null, 2));
  
  if (result.status === 200) {
    console.log('✅ /api/analyze endpoint working correctly');
    return result.data;
  } else {
    console.log('❌ /api/analyze endpoint failed');
    return null;
  }
}

async function testActionPlanEndpoint(sessionData) {
  console.log('\n=== Testing /api/action-plan endpoint ===');
  
  if (!sessionData || !sessionData.sessionId) {
    console.log('⚠️  Skipping action plan test - no valid session data');
    return null;
  }
  
  // Assume first purpose path for testing
  const purposePaths = sessionData.purposePaths || [];
  if (purposePaths.length === 0) {
    console.log('⚠️  Skipping action plan test - no purpose paths found');
    return null;
  }
  
  const testData = {
    sessionId: sessionData.sessionId,
    chosenPathId: purposePaths[0].id
  };
  
  const result = await makeRequest('POST', '/api/action-plan', testData);
  
  console.log(`Status: ${result.status}`);
  console.log(`Response:`, JSON.stringify(result.data, null, 2));
  
  if (result.status === 200) {
    console.log('✅ /api/action-plan endpoint working correctly');
    return result.data;
  } else {
    console.log('❌ /api/action-plan endpoint failed');
    return null;
  }
}

async function testChatEndpoint(sessionData) {
  console.log('\n=== Testing /api/chat endpoint ===');
  
  if (!sessionData || !sessionData.sessionId) {
    console.log('⚠️  Skipping chat test - no valid session data');
    return null;
  }
  
  const testData = {
    sessionId: sessionData.sessionId,
    message: "Can you tell me more about the first career path you suggested?",
    context: "results"
  };
  
  const result = await makeRequest('POST', '/api/chat', testData);
  
  console.log(`Status: ${result.status}`);
  console.log(`Response:`, JSON.stringify(result.data, null, 2));
  
  if (result.status === 200) {
    console.log('✅ /api/chat endpoint working correctly');
    return result.data;
  } else {
    console.log('❌ /api/chat endpoint failed');
    return null;
  }
}

async function testHealthCheck() {
  console.log('\n=== Testing server health ===');
  
  const result = await makeRequest('GET', '/');
  
  console.log(`Status: ${result.status}`);
  
  if (result.status === 200) {
    console.log('✅ Server is responding');
    return true;
  } else {
    console.log('❌ Server health check failed');
    return false;
  }
}

async function runTests() {
  console.log('🧪 Starting API Tests for Purpose Finder Application');
  console.log('Testing against:', BASE_URL);
  
  // Test 1: Health check
  const healthOk = await testHealthCheck();
  if (!healthOk) {
    console.log('\n❌ Server is not responding. Stopping tests.');
    return;
  }
  
  // Test 2: Analyze endpoint
  const sessionData = await testAnalyzeEndpoint();
  
  // Test 3: Action plan endpoint (depends on analyze)
  await testActionPlanEndpoint(sessionData);
  
  // Test 4: Chat endpoint (depends on analyze)
  await testChatEndpoint(sessionData);
  
  console.log('\n🏁 Test run complete');
}

// Run the tests
runTests().catch(console.error);