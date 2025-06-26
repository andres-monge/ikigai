/**
 * Full MVP Test Suite
 * Tests complete functionality including AI integration
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

async function testFullWorkflow() {
  console.log('🧪 Full MVP Test Suite\n');
  
  const results = [];
  let sessionId = null;

  // Test 1: Server Health Check
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

  // Test 2: Assessment Analysis (AI Integration)
  try {
    console.log('Testing AI analysis... (this may take 30-60 seconds)');
    
    const assessmentData = {
      sessionId: `test-${Date.now()}`,
      language: "en",
      responses: {
        passions: [
          {
            question: "What activities make you lose track of time?",
            answer: "I am passionate about helping others solve complex problems and seeing the impact of technology on people's lives."
          },
          {
            question: "What topics genuinely fascinate you?",
            answer: "I love learning new programming languages and building applications that make daily tasks easier."
          }
        ],
        skills: [
          {
            question: "What are you naturally good at?",
            answer: "I have strong analytical thinking, problem-solving abilities, and experience with JavaScript and Python."
          },
          {
            question: "What achievements are you most proud of?",
            answer: "I excel at breaking down complex problems, debugging code, and explaining technical concepts to others."
          }
        ],
        values: [
          {
            question: "What kind of impact do you want to make in the world?",
            answer: "I value continuous learning, work-life balance, and being part of a collaborative team environment."
          },
          {
            question: "What matters most to you in your work?",
            answer: "Making a positive impact through my work and having autonomy in how I approach problems is important to me."
          }
        ],
        economic: [
          {
            question: "What are your salary expectations?",
            answer: "I am looking for a stable career with growth potential and a starting salary of at least $60,000."
          },
          {
            question: "What are your long-term financial goals?",
            answer: "Long-term financial security and opportunities for advancement are important factors for me."
          }
        ]
      }
    };

    const startTime = Date.now();
    const response = await makeRequest('POST', '/api/analyze', assessmentData);
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    const passed = response.status === 200 && 
                   response.data.analysis && 
                   response.data.purposePaths && 
                   response.data.purposePaths.length === 3;
    
    results.push({
      test: 'AI Assessment Analysis',
      passed,
      details: passed 
        ? `Success in ${duration}s - Generated ${response.data.purposePaths?.length} purpose paths`
        : `Failed: ${response.status} - ${JSON.stringify(response.data).substring(0, 100)}`
    });

    if (passed) {
      sessionId = response.data.sessionId;
      console.log(`✅ Analysis complete! Session ID: ${sessionId}`);
      console.log(`Purpose Paths Generated:`);
      response.data.purposePaths.forEach((path, i) => {
        console.log(`  ${i + 1}. ${path.title} (${path.category})`);
      });
    }
  } catch (error) {
    results.push({
      test: 'AI Assessment Analysis',
      passed: false,
      details: `Error: ${error.message}`
    });
  }

  // Test 3: Action Plan Generation (if analysis succeeded)
  if (sessionId) {
    try {
      console.log('\nTesting action plan generation...');
      
      const actionPlanData = {
        sessionId,
        selectedPathIndex: 0
      };

      const startTime = Date.now();
      const response = await makeRequest('POST', '/api/action-plan', actionPlanData);
      const duration = Math.round((Date.now() - startTime) / 1000);
      
      const passed = response.status === 200 && 
                     response.data.actionPlan && 
                     response.data.actionPlan.steps;
      
      results.push({
        test: 'Action Plan Generation',
        passed,
        details: passed 
          ? `Success in ${duration}s - Generated ${response.data.actionPlan?.steps?.length} steps`
          : `Failed: ${response.status} - ${JSON.stringify(response.data).substring(0, 100)}`
      });

      if (passed) {
        console.log(`✅ Action plan generated with ${response.data.actionPlan.steps.length} steps`);
      }
    } catch (error) {
      results.push({
        test: 'Action Plan Generation',
        passed: false,
        details: `Error: ${error.message}`
      });
    }
  } else {
    results.push({
      test: 'Action Plan Generation',
      passed: false,
      details: 'Skipped - No session ID from analysis'
    });
  }

  // Test 4: Chat Functionality (if session exists)
  if (sessionId) {
    try {
      console.log('\nTesting chat functionality...');
      
      const chatData = {
        sessionId,
        message: "Can you tell me more about the salary expectations for the first career path?"
      };

      const startTime = Date.now();
      const response = await makeRequest('POST', '/api/chat', chatData);
      const duration = Math.round((Date.now() - startTime) / 1000);
      
      const passed = response.status === 200 && response.data.reply;
      
      results.push({
        test: 'Chat Functionality',
        passed,
        details: passed 
          ? `Success in ${duration}s - Got AI response`
          : `Failed: ${response.status} - ${JSON.stringify(response.data).substring(0, 100)}`
      });

      if (passed) {
        console.log(`✅ Chat response received`);
      }
    } catch (error) {
      results.push({
        test: 'Chat Functionality',
        passed: false,
        details: `Error: ${error.message}`
      });
    }
  } else {
    results.push({
      test: 'Chat Functionality',
      passed: false,
      details: 'Skipped - No session ID from analysis'
    });
  }

  // Test 5: Storage & Session Management
  if (sessionId) {
    try {
      const response = await makeRequest('GET', `/api/chat/${sessionId}`);
      const passed = response.status === 200 && Array.isArray(response.data);
      
      results.push({
        test: 'Session Storage',
        passed,
        details: passed 
          ? `Success - Retrieved ${response.data.length} chat messages`
          : `Failed: ${response.status}`
      });
    } catch (error) {
      results.push({
        test: 'Session Storage',
        passed: false,
        details: `Error: ${error.message}`
      });
    }
  } else {
    results.push({
      test: 'Session Storage',
      passed: false,
      details: 'Skipped - No session ID available'
    });
  }

  // Display Results
  console.log('\n' + '='.repeat(60));
  console.log('FINAL TEST RESULTS');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(result => {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.test}: ${result.details}`);
  });
  
  console.log('='.repeat(60));
  console.log(`Overall: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('\n🎉 MVP IS FULLY FUNCTIONAL!');
    console.log('\nVerified capabilities:');
    console.log('• ✅ Express server running properly');
    console.log('• ✅ API routes registered and responding');
    console.log('• ✅ AI assessment analysis working');
    console.log('• ✅ Action plan generation functional');
    console.log('• ✅ Chat interface operational');
    console.log('• ✅ Session storage working');
    console.log('\nThe MVP is ready for user testing and deployment!');
  } else {
    console.log('\n⚠️ Some functionality needs attention:');
    results.filter(r => !r.passed).forEach(result => {
      console.log(`• ${result.test}: ${result.details}`);
    });
  }
  
  return passed === total;
}

testFullWorkflow().catch(console.error);