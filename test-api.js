
const testData = {
  sessionId: "test-session-1",
  language: "en",
  responses: {
    passions: {
      activities: "building software applications and solving complex problems",
      topics: ["technology", "innovation", "user experience"],
      energizing: "Creating solutions that make people's lives easier"
    },
    skills: {
      strengths: ["programming", "problem-solving", "communication"],
      achievements: "Built several web applications that are used by hundreds of users",
      feedback: "Colleagues often mention my ability to break down complex problems"
    },
    values: {
      workValues: ["autonomy", "creativity", "impact"],
      impact: "I want to create technology that positively impacts society",
      environment: "I thrive in collaborative environments with smart, motivated people"
    },
    economic: {
      salaryExpectation: "$80,000 - $120,000",
      timeline: "1-2 years",
      stability: "I value both stability and growth opportunities"
    }
  }
};

async function testAnalyzeAPI() {
  try {
    console.log("🚀 Sending POST request to /api/analyze...");
    
    const response = await fetch('http://localhost:5000/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });

    console.log(`✅ HTTP Status: ${response.status} ${response.statusText}`);
    
    const responseData = await response.json();
    
    console.log("📋 Response structure check:");
    console.log("- Has id:", typeof responseData.id !== 'undefined');
    console.log("- Has sessionId:", typeof responseData.sessionId !== 'undefined');
    console.log("- Has coreDriversAnalysis:", typeof responseData.coreDriversAnalysis !== 'undefined');
    console.log("- Has purposePaths array:", Array.isArray(responseData.purposePaths));
    console.log("- Number of purpose paths:", responseData.purposePaths?.length || 0);
    
    if (responseData.purposePaths && responseData.purposePaths.length > 0) {
      console.log("- First path has salaryData:", typeof responseData.purposePaths[0].salaryData !== 'undefined');
      
      // Check for salary data
      const hasSalaryData = responseData.purposePaths.some(path => 
        path.salaryData && path.salaryData.length > 0
      );
      console.log("- Has salary data with sources:", hasSalaryData);
      
      if (hasSalaryData) {
        const firstSalaryData = responseData.purposePaths.find(path => 
          path.salaryData && path.salaryData.length > 0
        )?.salaryData[0];
        
        console.log("- Has citation URLs:", Array.isArray(firstSalaryData?.sources) && firstSalaryData.sources.length > 0);
        console.log("- Sample sources:", firstSalaryData?.sources?.slice(0, 2));
      }
    }
    
    console.log("\n📄 Full response (truncated):");
    console.log(JSON.stringify(responseData, null, 2).substring(0, 500) + "...");
    
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testAnalyzeAPI();
