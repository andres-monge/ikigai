/**
 * Simple MVP Test - Core Infrastructure Only
 * Tests basic functionality without external API dependencies
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

async function runQuickTests() {
  console.log('🧪 MVP Quick Infrastructure Test\n');
  
  const results = [];
  
  // Test 1: Server Health
  try {
    const response = await makeRequest('GET', '/');
    results.push({
      test: 'Server Health',
      passed: response.status === 200,
      details: `Status: ${response.status}`
    });
  } catch (error) {
    results.push({
      test: 'Server Health',
      passed: false,
      details: `Error: ${error.message}`
    });
  }
  
  // Test 2: Route Registration
  try {
    const response = await makeRequest('POST', '/api/analyze', {});
    results.push({
      test: 'Analyze Route',
      passed: response.status === 400 && response.data.error === "Invalid request data",
      details: `Validation working: ${response.status === 400}`
    });
  } catch (error) {
    results.push({
      test: 'Analyze Route',
      passed: false,
      details: `Error: ${error.message}`
    });
  }
  
  // Test 3: Action Plan Route
  try {
    const response = await makeRequest('POST', '/api/action-plan', {});
    results.push({
      test: 'Action Plan Route',
      passed: response.status === 400 && response.data.error === "Invalid request data",
      details: `Validation working: ${response.status === 400}`
    });
  } catch (error) {
    results.push({
      test: 'Action Plan Route',
      passed: false,
      details: `Error: ${error.message}`
    });
  }
  
  // Test 4: Chat Route
  try {
    const response = await makeRequest('POST', '/api/chat', {});
    results.push({
      test: 'Chat Route',
      passed: response.status === 400 && response.data.error === "Invalid request data",
      details: `Validation working: ${response.status === 400}`
    });
  } catch (error) {
    results.push({
      test: 'Chat Route',
      passed: false,
      details: `Error: ${error.message}`
    });
  }
  
  // Test 5: Chat History Route
  try {
    const response = await makeRequest('GET', '/api/chat/nonexistent-session');
    results.push({
      test: 'Chat History Route',
      passed: response.status === 404,
      details: `Session validation: ${response.status === 404 ? 'Working' : 'Failed'}`
    });
  } catch (error) {
    results.push({
      test: 'Chat History Route',
      passed: false,
      details: `Error: ${error.message}`
    });
  }
  
  // Display Results
  console.log('Test Results:');
  console.log('─'.repeat(50));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(result => {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.test}: ${result.details}`);
  });
  
  console.log('─'.repeat(50));
  console.log(`Overall: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('\n🎉 All infrastructure tests passed!');
    console.log('\nCore functionality verified:');
    console.log('• Express server running properly');
    console.log('• API routes registered and responding');
    console.log('• Request validation working');
    console.log('• Error handling functional');
    console.log('\nThe MVP backend is ready. To test AI features, provide a GEMINI_API_KEY.');
  } else {
    console.log('\n⚠️ Some tests failed. Check the details above.');
  }
  
  return passed === total;
}

runQuickTests().catch(console.error);