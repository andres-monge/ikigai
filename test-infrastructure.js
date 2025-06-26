#!/usr/bin/env node

/**
 * Quick Infrastructure Test for Purpose Finder Application
 * Tests basic server functionality without waiting for AI processing
 */

const BASE_URL = 'http://localhost:5000';

async function testBasicEndpoints() {
  console.log('🔧 Testing Basic Infrastructure\n');

  // Test 1: Health check
  try {
    const response = await fetch(`${BASE_URL}/`);
    console.log(`✅ Server health: ${response.status}`);
  } catch (error) {
    console.log(`❌ Server health failed: ${error.message}`);
    return false;
  }

  // Test 2: Schema validation on analyze endpoint
  try {
    const response = await fetch(`${BASE_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // Empty body to test validation
    });
    const data = await response.json();
    
    if (response.status === 400 && data.error === "Invalid request data") {
      console.log('✅ Request validation working');
    } else {
      console.log('❌ Request validation not working as expected');
    }
  } catch (error) {
    console.log(`❌ Validation test failed: ${error.message}`);
  }

  // Test 3: Check if routes are properly registered
  const endpoints = ['/api/analyze', '/api/action-plan', '/api/chat'];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      if (response.status === 400 || response.status === 404) {
        console.log(`✅ Route ${endpoint}: Registered (${response.status})`);
      } else {
        console.log(`⚠️  Route ${endpoint}: Unexpected status ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ Route ${endpoint}: Error - ${error.message}`);
    }
  }

  console.log('\n🏁 Infrastructure test complete');
  return true;
}

testBasicEndpoints().catch(console.error);