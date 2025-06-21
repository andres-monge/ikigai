
/**
 * Comprehensive test for the /api/analyze endpoint
 * Tests the complete flow: questionnaire -> AI analysis -> salary data with search grounding
 */

const testData = {
  sessionId: "test-session-" + Date.now(),
  language: "en",
  responses: {
    passions: {
      activities: "building software applications and solving complex technical problems",
      topics: ["technology", "artificial intelligence", "user experience design"],
      energizing: "Creating solutions that make people's lives easier and more productive"
    },
    skills: {
      strengths: ["programming", "problem-solving", "system design", "communication"],
      achievements: "Built several full-stack web applications used by hundreds of users, led technical teams",
      feedback: "Colleagues often mention my ability to break down complex problems and find elegant solutions"
    },
    values: {
      workValues: ["autonomy", "creativity", "impact", "continuous learning"],
      impact: "I want to create technology that positively impacts society and helps solve real problems",
      environment: "I thrive in collaborative environments with smart, motivated people who value innovation"
    },
    economic: {
      salaryExpectation: "$90,000 - $140,000",
      timeline: "12-18 months",
      stability: "I value both financial stability and growth opportunities, willing to take calculated risks"
    }
  }
};

async function testAnalyzeEndpoint() {
  console.log("🚀 Testing /api/analyze endpoint...");
  console.log("📝 Test data:", JSON.stringify(testData, null, 2));
  
  try {
    const startTime = Date.now();
    
    console.log("\n🔄 Sending POST request to http://localhost:5000/api/analyze...");
    
    const response = await fetch('http://localhost:5000/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });
    
    const duration = Date.now() - startTime;
    console.log(`⏱️  Request completed in ${duration}ms`);
    
    // Test 1: Status Code
    console.log(`\n✅ Test 1 - Status Code: ${response.status}`);
    if (response.status !== 200) {
      const errorText = await response.text();
      console.error(`❌ Expected 200, got ${response.status}`);
      console.error("Error response:", errorText);
      return;
    }
    
    // Get response data
    const responseData = await response.json();
    console.log("\n📦 Response structure:");
    console.log("- Keys:", Object.keys(responseData));
    
    // Test 2: Response Shape
    console.log("\n✅ Test 2 - Response Shape:");
    const requiredFields = ['id', 'sessionId', 'language', 'responses', 'coreDriversAnalysis', 'purposePaths'];
    
    for (const field of requiredFields) {
      if (responseData.hasOwnProperty(field)) {
        console.log(`  ✓ ${field}: present`);
      } else {
        console.log(`  ❌ ${field}: MISSING`);
      }
    }
    
    // Test 3: Purpose Paths and Salary Data
    console.log("\n✅ Test 3 - Purpose Paths & Salary Data:");
    
    if (responseData.purposePaths && Array.isArray(responseData.purposePaths)) {
      console.log(`  ✓ Purpose paths count: ${responseData.purposePaths.length}`);
      
      responseData.purposePaths.forEach((path, index) => {
        console.log(`  Path ${index + 1}: "${path.title}"`);
        console.log(`    - Description: ${path.description ? 'present' : 'missing'}`);
        console.log(`    - Ikigai alignment: ${path.ikigaiAlignment ? 'present' : 'missing'}`);
        console.log(`    - Action strategy: ${path.actionStrategy ? 'present' : 'missing'}`);
        
        // Check for salary data
        if (path.salaryData && path.salaryData.length > 0) {
          const salaryInfo = path.salaryData[0];
          console.log(`    - Salary data: ✓ present`);
          console.log(`      * Entry level: ${salaryInfo.entryLevel}`);
          console.log(`      * Mid level: ${salaryInfo.midLevel}`);
          console.log(`      * Senior level: ${salaryInfo.seniorLevel}`);
          console.log(`      * Location: ${salaryInfo.location}`);
          console.log(`      * Sources: ${salaryInfo.sources ? salaryInfo.sources.length : 0} URLs`);
          
          if (salaryInfo.sources && salaryInfo.sources.length > 0) {
            console.log("      * Sample sources:");
            salaryInfo.sources.slice(0, 2).forEach(source => {
              console.log(`        - ${source}`);
            });
          }
        } else {
          console.log(`    - Salary data: ❌ missing or empty`);
        }
      });
    } else {
      console.log("  ❌ Purpose paths: missing or not an array");
    }
    
    // Test 4: Core Drivers Analysis
    console.log("\n✅ Test 4 - Core Drivers Analysis:");
    if (responseData.coreDriversAnalysis) {
      const analysis = responseData.coreDriversAnalysis;
      const driverKeys = ['energy', 'edge', 'impact', 'economic'];
      
      driverKeys.forEach(key => {
        if (analysis[key]) {
          console.log(`  ✓ ${key}: present (${analysis[key].length} chars)`);
        } else {
          console.log(`  ❌ ${key}: missing`);
        }
      });
    } else {
      console.log("  ❌ Core drivers analysis: missing");
    }
    
    // Test 5: Search Grounding Validation
    console.log("\n✅ Test 5 - Search Grounding Validation:");
    let totalSalaryEntries = 0;
    let entriesWithSources = 0;
    let totalSources = 0;
    
    if (responseData.purposePaths) {
      responseData.purposePaths.forEach(path => {
        if (path.salaryData) {
          path.salaryData.forEach(salary => {
            totalSalaryEntries++;
            if (salary.sources && salary.sources.length > 0) {
              entriesWithSources++;
              totalSources += salary.sources.length;
            }
          });
        }
      });
    }
    
    console.log(`  📊 Salary entries: ${totalSalaryEntries}`);
    console.log(`  🔗 Entries with sources: ${entriesWithSources}/${totalSalaryEntries}`);
    console.log(`  📚 Total source URLs: ${totalSources}`);
    
    if (entriesWithSources > 0 && totalSources > 0) {
      console.log("  🎉 SUCCESS: Search grounding is working!");
    } else {
      console.log("  ⚠️  WARNING: Search grounding may not be working properly");
    }
    
    console.log("\n🎯 FINAL SUMMARY:");
    console.log(`✓ Status: ${response.status === 200 ? 'PASS' : 'FAIL'}`);
    console.log(`✓ Structure: ${responseData.purposePaths ? 'PASS' : 'FAIL'}`);
    console.log(`✓ AI Analysis: ${responseData.coreDriversAnalysis ? 'PASS' : 'FAIL'}`);
    console.log(`✓ Search Integration: ${entriesWithSources > 0 ? 'PASS' : 'FAIL'}`);
    console.log(`✓ Duration: ${duration}ms`);
    
  } catch (error) {
    console.error("\n❌ Test failed with error:");
    console.error(error.message);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
  }
}

// Run the test
console.log("🔬 Starting comprehensive API test...");
testAnalyzeEndpoint().then(() => {
  console.log("\n✨ Test completed!");
}).catch(error => {
  console.error("\n💥 Test suite failed:", error);
});
