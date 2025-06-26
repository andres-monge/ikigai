/**
 * Quick diagnostic test for Gemini API workflows
 */

import http from 'http';
import { randomUUID } from 'crypto';

const PORT = 5000;
const HOST = 'localhost';

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Request timeout after 60s`));
    }, 60000);

    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      clearTimeout(timeout);
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
      clearTimeout(timeout);
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testBasicFlow() {
  console.log('Testing basic AI analysis flow...');
  
  const sessionId = randomUUID();
  const requestData = {
    sessionId: sessionId,
    responses: {
      passions: [
        { question: "What activities make you lose track of time?", answer: "Coding and problem solving" }
      ],
      skills: [
        { question: "What do people ask for your help with?", answer: "Technical troubleshooting" }
      ],
      values: [
        { question: "What causes do you care about?", answer: "Making tech accessible" }
      ],
      economic: [
        { question: "What are your financial goals?", answer: "Stable income with growth" }
      ]
    },
    language: 'en'
  };

  try {
    console.log('Sending analysis request...');
    const response = await makeRequest('POST', '/api/analyze', requestData);
    
    console.log(`Status: ${response.statusCode}`);
    
    if (response.statusCode !== 200) {
      console.log('Response body:', response.rawBody);
      throw new Error(`Analysis failed with status ${response.statusCode}`);
    }

    const session = response.data;
    console.log('Analysis completed successfully!');
    console.log(`Session ID: ${session.sessionId}`);
    console.log(`Purpose paths generated: ${session.purposePaths?.length || 0}`);
    console.log(`Core drivers analysis: ${session.coreDriversAnalysis ? 'Present' : 'Missing'}`);
    
    if (session.purposePaths && session.purposePaths.length > 0) {
      console.log(`First path title: ${session.purposePaths[0].title}`);
    }
    
    return session;
  } catch (error) {
    console.error('Analysis test failed:', error.message);
    throw error;
  }
}

testBasicFlow()
  .then(() => {
    console.log('\n✅ Gemini API workflow test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });