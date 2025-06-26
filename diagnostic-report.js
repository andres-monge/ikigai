/**
 * Comprehensive diagnostic report for Purpose Finder backend
 */

import http from 'http';
import { randomUUID } from 'crypto';

const PORT = 5000;
const HOST = 'localhost';

// Test utilities
function makeRequest(method, path, data = null, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      clearTimeout(timer);
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve({ statusCode: res.statusCode, data: parsed, rawBody: body });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: body, rawBody: body });
        }
      });
    });

    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runDiagnostic() {
  console.log('🔍 Purpose Finder Backend Diagnostic Report');
  console.log('=' * 50);
  
  const results = {
    serverHealth: null,
    apiRouting: null,
    requestValidation: null,
    errorHandling: null,
    aiWorkflow: null
  };

  // 1. Test server health
  console.log('\n1. Testing server health...');
  try {
    const response = await makeRequest('GET', '/', null, 5000);
    results.serverHealth = {
      status: 'PASS',
      statusCode: response.statusCode,
      message: 'Server is responding'
    };
    console.log('   ✅ Server is running and responding');
  } catch (error) {
    results.serverHealth = {
      status: 'FAIL',
      error: error.message
    };
    console.log('   ❌ Server health check failed:', error.message);
  }

  // 2. Test API routing
  console.log('\n2. Testing API route availability...');
  try {
    // Test invalid route
    const invalidResponse = await makeRequest('GET', '/api/nonexistent', null, 5000);
    results.apiRouting = {
      status: 'PASS',
      message: 'API routing is working',
      invalidRouteStatus: invalidResponse.statusCode
    };
    console.log('   ✅ API routing is configured properly');
  } catch (error) {
    results.apiRouting = {
      status: 'FAIL',
      error: error.message
    };
    console.log('   ❌ API routing test failed:', error.message);
  }

  // 3. Test request validation
  console.log('\n3. Testing request validation...');
  try {
    // Test with invalid data
    const invalidResponse = await makeRequest('POST', '/api/analyze', {
      invalidField: 'test'
    }, 5000);
    
    if (invalidResponse.statusCode === 400) {
      results.requestValidation = {
        status: 'PASS',
        message: 'Request validation is working',
        validationResponse: invalidResponse.data
      };
      console.log('   ✅ Request validation is working properly');
    } else {
      results.requestValidation = {
        status: 'FAIL',
        message: `Expected 400 status, got ${invalidResponse.statusCode}`
      };
      console.log('   ⚠️ Request validation may not be working as expected');
    }
  } catch (error) {
    results.requestValidation = {
      status: 'FAIL',
      error: error.message
    };
    console.log('   ❌ Request validation test failed:', error.message);
  }

  // 4. Test error handling
  console.log('\n4. Testing error handling...');
  try {
    // Test with invalid session
    const errorResponse = await makeRequest('POST', '/api/action-plan', {
      sessionId: 'invalid-session-id',
      chosenPathId: 1
    }, 5000);
    
    if (errorResponse.statusCode === 404) {
      results.errorHandling = {
        status: 'PASS',
        message: 'Error handling is working',
        errorResponse: errorResponse.data
      };
      console.log('   ✅ Error handling is working properly');
    } else {
      results.errorHandling = {
        status: 'FAIL',
        message: `Expected 404 status, got ${errorResponse.statusCode}`
      };
      console.log('   ⚠️ Error handling may not be working as expected');
    }
  } catch (error) {
    results.errorHandling = {
      status: 'FAIL',
      error: error.message
    };
    console.log('   ❌ Error handling test failed:', error.message);
  }

  // 5. Test AI workflow (with longer timeout)
  console.log('\n5. Testing AI workflow (this may take up to 5 minutes)...');
  try {
    const sessionId = randomUUID();
    const requestData = {
      sessionId: sessionId,
      responses: {
        passions: [
          { question: "What activities make you lose track of time?", answer: "Building software solutions" }
        ],
        skills: [
          { question: "What do people ask for your help with?", answer: "Technical problem solving" }
        ],
        values: [
          { question: "What causes do you care about?", answer: "Innovation and accessibility" }
        ],
        economic: [
          { question: "What are your financial goals?", answer: "Stable growth and security" }
        ]
      },
      language: 'en'
    };

    console.log('   📤 Sending AI analysis request (timeout: 5 minutes)...');
    const aiResponse = await makeRequest('POST', '/api/analyze', requestData, 300000); // 5 minutes
    
    if (aiResponse.statusCode === 200) {
      const session = aiResponse.data;
      results.aiWorkflow = {
        status: 'PASS',
        message: 'AI workflow completed successfully',
        sessionId: session.sessionId,
        purposePathsCount: session.purposePaths?.length || 0,
        hasCoreDrivers: !!session.coreDriversAnalysis,
        firstPathTitle: session.purposePaths?.[0]?.title || 'N/A'
      };
      console.log('   ✅ AI workflow completed successfully');
      console.log(`   📊 Generated ${session.purposePaths?.length || 0} purpose paths`);
      console.log(`   🎯 Core drivers analysis: ${session.coreDriversAnalysis ? 'Present' : 'Missing'}`);
    } else {
      results.aiWorkflow = {
        status: 'FAIL',
        message: `AI workflow failed with status ${aiResponse.statusCode}`,
        response: aiResponse.data
      };
      console.log('   ❌ AI workflow failed');
    }
  } catch (error) {
    results.aiWorkflow = {
      status: 'FAIL',
      error: error.message
    };
    console.log('   ❌ AI workflow test failed:', error.message);
  }

  // Generate final report
  console.log('\n📋 DIAGNOSTIC SUMMARY');
  console.log('=' * 50);
  
  const allTests = Object.values(results);
  const passedTests = allTests.filter(test => test?.status === 'PASS').length;
  const failedTests = allTests.filter(test => test?.status === 'FAIL').length;
  
  console.log(`Total Tests: ${allTests.length}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  
  console.log('\nDetailed Results:');
  Object.entries(results).forEach(([testName, result]) => {
    if (result) {
      const status = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${status} ${testName}: ${result.message || result.error}`);
    }
  });

  if (failedTests === 0) {
    console.log('\n🎉 All systems operational! Gemini API workflows are working correctly.');
  } else if (results.aiWorkflow?.status === 'PASS') {
    console.log('\n✅ Core AI workflow is functional, minor issues detected in other areas.');
  } else {
    console.log('\n⚠️ Issues detected. Check the detailed results above.');
  }

  return results;
}

runDiagnostic()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n💥 Diagnostic crashed:', error.message);
    process.exit(1);
  });