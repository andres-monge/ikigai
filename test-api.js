
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testAPI() {
  console.log('🧪 Testing Purpose Finder API Routes...\n');

  // Test 1: Check server health
  try {
    console.log('1. Testing server health...');
    const response = await fetch(`${BASE_URL}/`);
    if (response.ok) {
      console.log('✅ Server is running and accessible');
    } else {
      console.log('❌ Server returned error:', response.status);
    }
  } catch (error) {
    console.log('❌ Server is not accessible:', error.message);
    return;
  }

  // Test 2: Test /api/analyze endpoint with correct schema
  try {
    console.log('\n2. Testing /api/analyze endpoint...');
    const testData = {
      sessionId: "test-session-123",
      language: "en",
      responses: {
        passions: [
          { question: "What activities make you lose track of time?", answer: "Programming and solving complex problems" },
          { question: "What topics fascinate you?", answer: "Artificial intelligence and technology" }
        ],
        skills: [
          { question: "What are you naturally good at?", answer: "Logical thinking and problem-solving" },
          { question: "What achievements are you proud of?", answer: "Built several web applications" }
        ],
        values: [
          { question: "What impact do you want to make?", answer: "Help people through technology" },
          { question: "What work environment do you prefer?", answer: "Collaborative and innovative" }
        ],
        economic: [
          { question: "What are your salary expectations?", answer: "$80,000-$120,000" },
          { question: "What are your financial goals?", answer: "Financial stability and growth" }
        ]
      }
    };

    const response = await fetch(`${BASE_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ /api/analyze endpoint working');
      console.log('   Response contains:', Object.keys(result));
    } else {
      const errorText = await response.text();
      console.log('❌ /api/analyze failed:', response.status);
      console.log('   Error details:', errorText);
    }
  } catch (error) {
    console.log('❌ /api/analyze error:', error.message);
  }

  // Test 3: Test /api/chat endpoint (SSE) with correct context
  try {
    console.log('\n3. Testing /api/chat endpoint (SSE)...');
    const chatData = {
      message: "Hello Nami, can you help me understand my career options?",
      context: "discovery", // Fixed: using 'discovery' instead of 'purpose_discovery'
      sessionId: "test-session-123"
    };

    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatData)
    });

    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      console.log('✅ /api/chat endpoint configured for SSE');
      console.log('   Content-Type:', response.headers.get('content-type'));
    } else {
      console.log('❌ /api/chat not configured for SSE');
      console.log('   Content-Type:', response.headers.get('content-type'));
      if (!response.ok) {
        const errorText = await response.text();
        console.log('   Error details:', errorText);
      }
    }
  } catch (error) {
    console.log('❌ /api/chat error:', error.message);
  }

  // Test 4: Check environment variables
  console.log('\n4. Checking environment setup...');
  if (process.env.GEMINI_API_KEY) {
    console.log('✅ GEMINI_API_KEY is set');
  } else {
    console.log('⚠️  GEMINI_API_KEY not found in environment');
  }

  console.log('\n🏁 API testing complete!');
}

// Run the tests
testAPI().catch(console.error);
