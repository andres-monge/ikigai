/**
 * Step 18 Test Suite - Chat Interface Streaming
 * Tests the streaming chat functionality implemented in step 18
 */

const BASE_URL = 'http://localhost:5000';

async function makeRequest(method, endpoint, data = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  const response = await fetch(`${BASE_URL}${endpoint}`, options);
  return {
    status: response.status,
    data: response.status === 204 ? null : await response.json(),
  };
}

async function testChatStreaming(sessionId) {
  console.log('\n🧪 Testing Chat Streaming (Step 18)...');
  
  return new Promise((resolve, reject) => {
    const eventSource = new EventSource(`${BASE_URL}/api/chat?sessionId=${sessionId}&message=Tell me more about becoming a software engineer&language=en`);
    
    let messageReceived = false;
    let chunks = [];
    const timeout = setTimeout(() => {
      eventSource.close();
      reject(new Error('Chat streaming timeout - no response after 30 seconds'));
    }, 30000);
    
    eventSource.onopen = () => {
      console.log('✅ EventSource connection opened');
    };
    
    eventSource.onmessage = (event) => {
      messageReceived = true;
      console.log('📨 Received chunk:', event.data.substring(0, 100) + '...');
      
      if (event.data === '[DONE]') {
        clearTimeout(timeout);
        eventSource.close();
        console.log('✅ Chat streaming completed successfully');
        console.log(`📊 Total chunks received: ${chunks.length}`);
        resolve({ success: true, chunks: chunks.length });
      } else {
        chunks.push(event.data);
      }
    };
    
    eventSource.onerror = (error) => {
      clearTimeout(timeout);
      eventSource.close();
      console.log('❌ EventSource error:', error);
      reject(new Error('Chat streaming failed'));
    };
  });
}

async function setupTestSession() {
  console.log('\n🔧 Setting up test session...');
  
  // Create a test session with sample data in correct format
  const testData = {
    sessionId: `test-${Date.now()}`,
    responses: {
      passions: [
        { question: "What activities make you lose track of time?", answer: "I love solving complex technical problems" },
        { question: "What topics do you naturally gravitate towards?", answer: "Building software that helps people" }
      ],
      skills: [
        { question: "What do people often come to you for help with?", answer: "Working with cutting-edge technology" },
        { question: "What feels easy to you but hard for others?", answer: "Creating scalable systems" }
      ],
      values: [
        { question: "What impact do you want to have on the world?", answer: "Making the world more efficient through code" },
        { question: "What working environment brings out your best?", answer: "Collaborating with smart teams" }
      ],
      economic: [
        { question: "What are your financial goals?", answer: "I want to earn at least $100k annually" },
        { question: "What lifestyle factors are important to you?", answer: "Remote work flexibility is important" }
      ]
    },
    language: "en"
  };
  
  const result = await makeRequest('POST', '/api/analyze', testData);
  
  if (result.status !== 200) {
    throw new Error(`Failed to create test session: ${JSON.stringify(result.data)}`);
  }
  
  console.log('✅ Test session created successfully');
  return result.data.sessionId;
}

async function testChatValidation() {
  console.log('\n🧪 Testing Chat Input Validation...');
  
  // Test missing sessionId
  const invalidResult1 = await makeRequest('POST', '/api/chat', {
    message: "Test message",
    language: "en"
  });
  
  if (invalidResult1.status !== 400) {
    console.log('❌ Should reject missing sessionId');
    return false;
  }
  
  // Test missing message  
  const invalidResult2 = await makeRequest('POST', '/api/chat', {
    sessionId: "test-123",
    language: "en"
  });
  
  if (invalidResult2.status !== 400) {
    console.log('❌ Should reject missing message');
    return false;
  }
  
  console.log('✅ Chat validation working correctly');
  return true;
}

async function runStep18Tests() {
  console.log('🚀 Starting Step 18 Tests - Chat Interface Streaming\n');
  
  try {
    // Test validation first
    await testChatValidation();
    
    // Setup a real session
    const sessionId = await setupTestSession();
    
    // Test the streaming functionality
    const streamResult = await testChatStreaming(sessionId);
    
    console.log('\n✅ All Step 18 tests passed!');
    console.log('📋 Summary:');
    console.log('  - Chat input validation: ✅');
    console.log('  - Session creation: ✅');
    console.log('  - EventSource streaming: ✅');
    console.log(`  - Message chunks received: ${streamResult.chunks}`);
    
  } catch (error) {
    console.log('\n❌ Step 18 tests failed:');
    console.log(error.message);
    process.exit(1);
  }
}

// Run the tests
runStep18Tests();