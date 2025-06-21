
async function testSearchGrounding() {
  console.log('Testing the search grounding fix...');
  
  try {
    // First, create a test session
    const sessionResponse = await fetch('http://localhost:5000/api/assessment/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'en' })
    });
    
    if (!sessionResponse.ok) {
      throw new Error(`Failed to create session: ${sessionResponse.status}`);
    }
    
    const sessionData = await sessionResponse.json();
    console.log('✅ Created test session:', sessionData.sessionId);
    
    // Now test the analyze endpoint which triggers salary data fetching with search
    const mockResponses = {
      passions: {
        activities: "Programming and building web applications",
        topics: ["Technology", "Software Development"],
        energizing: "Creating solutions to complex problems"
      },
      skills: {
        strengths: ["JavaScript", "React", "Node.js"],
        achievements: "Built several full-stack applications",
        feedback: "Strong problem-solving abilities"
      },
      values: {
        workValues: ["Creativity", "Growth", "Impact"],
        impact: "Help businesses solve technical challenges",
        environment: "Collaborative and innovative"
      },
      economic: {
        salaryExpectation: "$80,000 - $120,000",
        timeline: "6-12 months",
        stability: "Important but willing to take calculated risks"
      }
    };
    
    console.log('🔄 Testing analysis with search grounding...');
    
    const analyzeResponse = await fetch('http://localhost:5000/api/assessment/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionData.sessionId,
        responses: mockResponses
      })
    });
    
    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text();
      throw new Error(`Analysis failed: ${analyzeResponse.status} - ${errorText}`);
    }
    
    const analysisResult = await analyzeResponse.json();
    console.log('✅ Analysis completed successfully!');
    console.log('📊 Core Drivers Analysis:', Object.keys(analysisResult.coreDriversAnalysis));
    console.log('🎯 Purpose Paths:', analysisResult.purposePaths.length);
    console.log('💰 Salary Data:', analysisResult.salaryData.length);
    
    // Check if salary data has sources (indicating search worked)
    const salaryWithSources = analysisResult.salaryData.filter(s => s.sources && s.sources.length > 0);
    console.log('🔍 Salary entries with search sources:', salaryWithSources.length);
    
    if (salaryWithSources.length > 0) {
      console.log('🎉 SUCCESS: Search grounding is working! Sample sources:');
      salaryWithSources.slice(0, 2).forEach((salary, i) => {
        console.log(`   ${i + 1}. ${salary.title}: ${salary.sources.slice(0, 2).join(', ')}`);
      });
    } else {
      console.log('⚠️  WARNING: No salary data has search sources - search may not be working');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    // Check if it's the old error we were trying to fix
    if (error.message.includes('Search Grounding is not supported') || 
        error.message.includes('400 Bad Request')) {
      console.log('🔧 This looks like the original error - the fix may not have worked');
    }
  }
}

testSearchGrounding();
