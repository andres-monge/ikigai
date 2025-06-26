# Project Name
Purpose Finder

## Project Description
An AI-powered web application designed to help career-switchers and students find their *ikigai* (a reason for being) and navigate their career path. The application, guided by an AI persona named Nami, will go beyond simple skills-matching to incorporate a user's core values, personality, and life priorities. The MVP will focus on delivering three distinct and actionable ikigai-aligned career paths based on a comprehensive user assessment. The user will select one and then the app will deliver an action plan for that path. The platform will be fully bilingual (English and Spanish) from launch.

## Target Audience
- Career-switchers and students, treated as a unified group for the MVP.

## Desired Features
### Purpose Discovery
- [ ] User completes a structured, multi-part questionnaire to identify their passions, skills, values, and economic needs.
- [ ] The AI (Nami) analyzes the user's input.
- [ ] The system generates and displays a summary of the user's core drivers (Passion, Ability, Positive Impact, Economics).
- [ ] The system presents three distinct "Purpose Paths" for the user to choose from.
    - [ ] Each path includes a title, a short description, and a breakdown of how it aligns with the four ikigai dimensions (Passion, Ability, Positive Impact, Economics).
    - [ ] Each path includes a high-level action plan or strategy (e.g., "Bootstrapped MVP in 6 mo").
- [ ] The system provides a comparative table with estimated salary ranges for the suggested paths, generated using real-time web search to ensure data is current and localized.
    - [ ] The AI must cite the URLs of its sources for the salary data.
- [ ] User can initiate a chat-based conversation with Nami to refine or request changes to the generated suggestions.
- [ ] User can export their results page to a PDF document.

### Action Plan & Guidance 
- [ ] Once a user selects a path, the AI generates a detailed, step-by-step action plan with a timeline.
- [ ] The action plan MUST include the following sections: Side project ideas, Skills to learn, Where to find the people that can tell you more about that path).
- [ ] For each skill in the Skills section, the system recommends the 3 most relevant YouTube videos to learn that skill.
- [ ] User can initiate a chat-based conversation with Nami to refine or request changes to the action plan.
- [ ] User can export their action plan page to a PDF document.

### Personality and Reasoning
- [ ] AI persona "Nami" personality and writing will mimic that of Paul Graham. It will use the principles outlined in these Paul Graham essays to decide which Purpose Paths it should present to the user. It will also use the essays to encourage and explain the why behind every suggestion made to the user in all interactions.
  - What to Do
  - How to Do What You Love
  - When To Do What You Love
  - How to Do Great Work
  - What You'll Wish You'd Known
  - How to Be an Expert in a Changing World
- [ ] The web application will be built and deployed using Replit.

### General
- [ ] No user accounts will be required for the MVP; user session data will be stored temporarily in the browser.
- [ ] Full bilingual support for English and Spanish across the entire user interface and AI interactions from day one.

## Design Requests
- [ ] Sleek and modern UI. Responsive and mobile-friendly.
- [ ] The output of the ikigai analysis should be clearly structured and presented in a format similar to the user's example.
    - [ ] A summary section ("What's popping out of your answers").
    - [ ] A clear, table-based comparison of the three ikigai options.
    - [ ] A secondary table providing salary benchmarks.
- [ ] A clean, intuitive chat interface for interacting with Nami for refinements.
