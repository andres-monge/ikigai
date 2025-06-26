/**
 * Direct test of AI wrapper to isolate any issues
 */

import { readFileSync } from 'fs';

// Read and execute the AI wrapper module to test it directly
const wrapperPath = './server/ai/wrapper.ts';

async function testDirectAPICall() {
  console.log('Testing direct Gemini API call...');
  
  try {
    // Test if we can make a simple API call
    const testBody = {
      contents: [{
        parts: [{ text: "Say 'Hello World' in exactly two words." }]
      }]
    };

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const model = 'models/gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${GEMINI_API_KEY}`;

    console.log('Making API request to:', url.replace(GEMINI_API_KEY, 'HIDDEN_KEY'));
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API failed with ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('API Response received successfully!');
    console.log('Response structure:', {
      hasCandidates: !!result.candidates,
      candidateCount: result.candidates?.length || 0,
      hasContent: !!result.candidates?.[0]?.content
    });

    if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.log('Response text:', result.candidates[0].content.parts[0].text);
    }

    return result;
  } catch (error) {
    console.error('Direct API test failed:', error.message);
    throw error;
  }
}

testDirectAPICall()
  .then(() => {
    console.log('\n✅ Direct Gemini API test passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Direct API test failed:', error.message);
    process.exit(1);
  });