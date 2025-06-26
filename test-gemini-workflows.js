/**
 * Comprehensive test script for Purpose Finder Gemini API workflows
 * Tests all major backend features including AI chains, storage, and API routes
 */

import http from 'http';
import { randomUUID } from 'crypto';

// Test configuration
const PORT = 5000;
const HOST = 'localhost';
const TIMEOUT = 300000; // 5 minutes for AI operations

// Sample questionnaire data for testing
const SAMPLE_QUESTIONNAIRE = {
  passions: [
    { question: "What activities make you lose track of time?", answer: "Writing code and solving complex problems" },
    { question: "What topics do you find yourself researching for fun?", answer: "Machine learning and artificial intelligence" }
  ],
  skills: [
    { question: "What do people often ask for your help with?", answer: "Technical troubleshooting and programming" },
    { question: "What comes naturally to you that others find difficult?", answer: "Understanding complex systems and breaking them down" }
  ],
  values: [
    { question: "What causes or issues do you care deeply about?", answer: "Making technology accessible to everyone" },
    { question: "What kind of impact do you want to have on the world?", answer: "Help solve problems through innovation" }
  ],
  economic: [
    { question: "What are your financial goals or requirements?", answer: "I want financial stability and growth potential" },
    { question: "How important is work-life balance to you?", answer: "Very important, I value flexibility and remote work options" }
  ]
};

// Utility functions
function makeRequest(method, path, data = null, useSSE = false) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Request timeout after ${TIMEOUT}ms`));
    }, TIMEOUT);

    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(useSSE ? { 'Accept': 'text/event-stream' } : {})
      }
    };

    const req = http.request(options, (res) => {
      clearTimeout(timeout);
      
      if (useSSE) {
        // Handle Server-Sent Events
        let chunks = [];
        let fullResponse = '';
        
        res.on('data', (chunk) => {
          const chunkStr = chunk.toString();
          chunks.push(chunkStr);
          
          // Parse SSE data
          const lines = chunkStr.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              if (data === '[DONE]') {
                resolve({ 
                  statusCode: res.statusCode, 
                  chunks: chunks,
                  fullResponse: fullResponse 
                });
                return;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullResponse += parsed.content;
                }
              } catch (e) {
                // Ignore parsing errors for partial chunks
              }
            }
          }
        });

        res.on('error', reject);
      } else {
        // Handle regular JSON responses
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const parsed = body ? JSON.parse(body) : {};
            resolve({ statusCode: res.statusCode, data: parsed });
          } catch (e) {
            resolve({ statusCode: res.statusCode, data: body });
          }
        });
      }
    });

    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runTest(testName, testFunction) {
  console.log(`\n🧪 Running: ${testName}`);
  console.log('─'.repeat(60));
  
  const startTime = Date.now();
  try {
    const result = await testFunction();
    const duration = Date.now() - startTime;
    console.log(`✅ PASSED (${duration}ms): ${testName}`);
    return { success: true, result, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ FAILED (${duration}ms): ${testName}`);
    console.log(`   Error: ${error.message}`);
    return { success: false, error: error.message, duration };
  }
}

// Test functions
async function testServerHealth() {
  const response = await makeRequest('GET', '/');
  if (response.statusCode !== 200) {
    throw new Error(`Server health check failed with status ${response.statusCode}`);
  }
  return 'Server is running';
}

async function testAnalyzeEndpoint() {
  const sessionId = randomUUID();
  const requestData = {
    sessionId: sessionId,
    responses: SAMPLE_QUESTIONNAIRE,
    language: 'en'
  };

  console.log('   📤 Sending questionnaire to /api/analyze...');
  const response = await makeRequest('POST', '/api/analyze', requestData);
  
  if (response.statusCode !== 200) {
    throw new Error(`Analyze endpoint failed with status ${response.statusCode}: ${JSON.stringify(response.data)}`);
  }

  const session = response.data;
  
  // Validate response structure
  if (!session.id || !session.sessionId || !session.coreDriversAnalysis) {
    throw new Error('Missing required fields in analysis response');
  }

  if (!session.purposePaths || session.purposePaths.length !== 3) {
    throw new Error(`Expected 3 purpose paths, got ${session.purposePaths?.length || 0}`);
  }

  // Check each purpose path has required fields
  for (const path of session.purposePaths) {
    if (!path.title || !path.description || !path.ikigaiAlignment) {
      throw new Error(`Purpose path missing required fields: ${JSON.stringify(path)}`);
    }
  }

  console.log(`   ✨ Generated ${session.purposePaths.length} purpose paths`);
  console.log(`   📊 Core drivers: ${session.coreDriversAnalysis?.substring(0, 100)}...`);
  
  return { session, sessionId };
}

async function testActionPlanEndpoint() {
  // First get a session with purpose paths
  console.log('   🔄 Setting up test session...');
  const { session, sessionId } = await testAnalyzeEndpoint();
  
  const chosenPathId = session.purposePaths[0].id;
  const requestData = {
    sessionId: sessionId,
    chosenPathId: chosenPathId
  };

  console.log('   📤 Requesting action plan...');
  const response = await makeRequest('POST', '/api/action-plan', requestData);
  
  if (response.statusCode !== 200) {
    throw new Error(`Action plan endpoint failed with status ${response.statusCode}: ${JSON.stringify(response.data)}`);
  }

  const updatedSession = response.data;
  
  if (!updatedSession.actionPlan) {
    throw new Error('Action plan not generated');
  }

  if (!updatedSession.actionPlan.phases || updatedSession.actionPlan.phases.length === 0) {
    throw new Error('Action plan has no phases');
  }

  console.log(`   📋 Generated action plan with ${updatedSession.actionPlan.phases.length} phases`);
  
  return { updatedSession, sessionId };
}

async function testChatEndpoint() {
  // First get a session
  console.log('   🔄 Setting up test session...');
  const { sessionId } = await testAnalyzeEndpoint();
  
  const chatRequest = {
    sessionId: sessionId,
    message: "Can you tell me more about the first career path?",
    context: "discovery"
  };

  console.log('   📤 Sending chat message...');
  const response = await makeRequest('POST', '/api/chat', chatRequest, true);
  
  if (response.statusCode !== 200) {
    throw new Error(`Chat endpoint failed with status ${response.statusCode}`);
  }

  if (!response.fullResponse || response.fullResponse.length < 10) {
    throw new Error('Chat response too short or empty');
  }

  console.log(`   💬 Received ${response.chunks.length} chunks, ${response.fullResponse.length} chars total`);
  
  return { response, sessionId };
}

async function testChatHistory() {
  // First send a chat message
  console.log('   🔄 Setting up chat session...');
  const { sessionId } = await testChatEndpoint();
  
  console.log('   📤 Fetching chat history...');
  const response = await makeRequest('GET', `/api/chat/${sessionId}`);
  
  if (response.statusCode !== 200) {
    throw new Error(`Chat history failed with status ${response.statusCode}: ${JSON.stringify(response.data)}`);
  }

  const messages = response.data;
  
  if (!Array.isArray(messages) || messages.length < 2) {
    throw new Error(`Expected at least 2 messages (user + assistant), got ${messages.length}`);
  }

  console.log(`   📝 Found ${messages.length} messages in history`);
  
  return messages;
}

async function testErrorHandling() {
  // Test invalid session ID
  console.log('   📤 Testing invalid session...');
  const response1 = await makeRequest('POST', '/api/action-plan', {
    sessionId: 'invalid-session-id',
    chosenPathId: 1
  });
  
  if (response1.statusCode !== 404) {
    throw new Error(`Expected 404 for invalid session, got ${response1.statusCode}`);
  }

  // Test malformed request
  console.log('   📤 Testing malformed request...');
  const response2 = await makeRequest('POST', '/api/analyze', {
    invalidField: 'test'
  });
  
  if (response2.statusCode !== 400) {
    throw new Error(`Expected 400 for malformed request, got ${response2.statusCode}`);
  }

  console.log('   ✅ Error handling working correctly');
  return 'Error handling validated';
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting Purpose Finder Gemini API Workflow Tests');
  console.log('=' * 60);
  
  const results = [];
  const startTime = Date.now();

  // Run tests
  results.push(await runTest('Server Health Check', testServerHealth));
  results.push(await runTest('Analysis Endpoint (Core Gemini Workflow)', testAnalyzeEndpoint));
  results.push(await runTest('Action Plan Endpoint (Secondary Gemini Workflow)', testActionPlanEndpoint));
  results.push(await runTest('Chat Endpoint (Streaming Gemini Workflow)', testChatEndpoint));
  results.push(await runTest('Chat History Retrieval', testChatHistory));
  results.push(await runTest('Error Handling', testErrorHandling));

  // Summary
  const totalTime = Date.now() - startTime;
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log('\n📊 TEST SUMMARY');
  console.log('=' * 60);
  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total Time: ${totalTime}ms`);
  
  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   • ${r.error}`);
    });
  }
  
  console.log('\n🔍 DETAILED TIMING:');
  results.forEach((r, i) => {
    const status = r.success ? '✅' : '❌';
    console.log(`   ${status} Test ${i + 1}: ${r.duration}ms`);
  });

  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Gemini API workflows are working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the details above.');
    process.exit(1);
  }
}

// Run the tests
runAllTests().catch(error => {
  console.error('\n💥 Test runner crashed:', error.message);
  process.exit(1);
});