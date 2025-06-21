
#!/bin/bash

echo "Testing /api/analyze endpoint..."

curl -X POST http://localhost:5000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session-1",
    "language": "en",
    "responses": {
      "passions": {
        "activities": "building software applications and solving complex problems",
        "topics": ["technology", "innovation", "user experience"],
        "energizing": "Creating solutions that make people's lives easier"
      },
      "skills": {
        "strengths": ["programming", "problem-solving", "communication"],
        "achievements": "Built several web applications that are used by hundreds of users",
        "feedback": "Colleagues often mention my ability to break down complex problems"
      },
      "values": {
        "workValues": ["autonomy", "creativity", "impact"],
        "impact": "I want to create technology that positively impacts society",
        "environment": "I thrive in collaborative environments with smart, motivated people"
      },
      "economic": {
        "salaryExpectation": "$80,000 - $120,000",
        "timeline": "1-2 years",
        "stability": "I value both stability and growth opportunities"
      }
    }
  }' \
  -w "\n\nHTTP Status Code: %{http_code}\n" \
  -s
