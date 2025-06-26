/**
 * Storage Functionality Test
 * Tests the storage layer and session management without AI dependencies
 */

const BASE_URL = 'http://localhost:5000';

async function makeRequest(method, endpoint, data = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (data) options.body = JSON.stringify(data);
  
  const response = await fetch(`${BASE_URL}${endpoint}`, options);
  return {
    status: response.status,
    data: response.headers.get('content-type')?.includes('application/json') 
      ? await response.json() 
      : await response.text()
  };
}

async function testStorageLayer() {
  console.log('🧪 Testing Storage Layer Functionality\n');
  
  const sessionId = `test-session-${Date.now()}`;
  const results = [];
  
  // Test 1: Valid request structure validation
  console.log('1. Testing request structure validation...');
  try {
    const validRequest = {
      sessionId,
      language: 'en',
      responses: {
        passions: [
          { question: "What activities energize you?", answer: "Building software solutions" }
        ],
        skills: [
          { question: "What are your natural strengths?", answer: "Problem-solving and logical thinking" }
        ],
        values: [
          { question: "What principles guide you?", answer: "Innovation and continuous learning" }
        ],
        economic: [
          { question: "What are your financial priorities?", answer: "Stable growth with learning opportunities" }
        ]
      }
    };
    
    const response = await makeRequest('POST', '/api/analyze', validRequest);
    
    // Storage layer should accept the request structure even if AI fails
    if (response.status === 200) {
      results.push({ test: 'Request Structure', passed: true, details: 'Full analysis completed' });
    } else if (response.status === 500 && 
               (response.data.error?.includes('API key') || 
                response.data.message?.includes('API key') ||
                response.data.error?.includes('GEMINI'))) {
      results.push({ test: 'Request Structure', passed: true, details: 'Validation passed, AI needs API key' });
    } else {
      results.push({ test: 'Request Structure', passed: false, details: `Unexpected: ${response.status} - ${JSON.stringify(response.data)}` });
    }
  } catch (error) {
    results.push({ test: 'Request Structure', passed: false, details: `Error: ${error.message}` });
  }
  
  // Test 2: Action plan endpoint with missing session
  console.log('2. Testing action plan with nonexistent session...');
  try {
    const response = await makeRequest('POST', '/api/action-plan', {
      sessionId: 'nonexistent-session',
      chosenPathId: 1
    });
    
    results.push({
      test: 'Action Plan Session Lookup',
      passed: response.status === 404 && response.data.error === "Session not found",
      details: response.status === 404 ? 'Session validation working' : `Unexpected: ${response.status}`
    });
  } catch (error) {
    results.push({ test: 'Action Plan Session Lookup', passed: false, details: `Error: ${error.message}` });
  }
  
  // Test 3: Chat endpoint with missing session
  console.log('3. Testing chat with nonexistent session...');
  try {
    const response = await makeRequest('POST', '/api/chat', {
      sessionId: 'nonexistent-session',
      message: 'Hello',
      context: 'discovery'
    });
    
    results.push({
      test: 'Chat Session Lookup',
      passed: response.status === 404 && response.data.error === "Session not found",
      details: response.status === 404 ? 'Session validation working' : `Unexpected: ${response.status}`
    });
  } catch (error) {
    results.push({ test: 'Chat Session Lookup', passed: false, details: `Error: ${error.message}` });
  }
  
  // Test 4: Invalid enum values
  console.log('4. Testing validation with invalid enum values...');
  try {
    const response = await makeRequest('POST', '/api/analyze', {
      sessionId: 'test-session',
      language: 'invalid-language',
      responses: {
        passions: [{ question: "test", answer: "test" }],
        skills: [{ question: "test", answer: "test" }],
        values: [{ question: "test", answer: "test" }],
        economic: [{ question: "test", answer: "test" }]
      }
    });
    
    results.push({
      test: 'Enum Validation',
      passed: response.status === 400,
      details: response.status === 400 ? 'Language enum validation working' : `Expected 400, got ${response.status}`
    });
  } catch (error) {
    results.push({ test: 'Enum Validation', passed: false, details: `Error: ${error.message}` });
  }
  
  // Display Results
  console.log('\nStorage Test Results:');
  console.log('─'.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(result => {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.test}: ${result.details}`);
  });
  
  console.log('─'.repeat(60));
  console.log(`Storage Layer: ${passed}/${total} tests passed`);
  
  return { passed, total, results };
}

testStorageLayer().catch(console.error);