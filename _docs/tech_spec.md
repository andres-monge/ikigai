# Purpose Finder Technical Specification

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

## 1. System Overview

- **Core Purpose and Value Proposition:** An AI-powered web application to help users find their _ikigai_. It provides three personalized career paths based on a user's profile. Upon selection of a path, it generates a **single, detailed, step-by-step action plan with timelines and milestones**. The entire experience is bilingual (English/Spanish).
    
- **Key Workflows:**
    
    1. **Assessment & Discovery:** The user completes a questionnaire. The system initiates a two-call AI process: a fast, lightweight call (GEMINI_FACTS_MODEL) with search grounding retrieves real-time salary data for analogous standard jobs. A parallel, more powerful call (GEMINI_REASONING_MODEL) performs the core analysis, consuming the salary data via function calling to produce the final "Core Drivers" summary and three "Purpose Paths". **The salary data is embedded directly into the narrative of each path, not as a separate data object.**
        
    2. **Discovery Refinement (Optional):** The user can chat with "Nami" to refine the three generated paths.
        
    3. **Path Selection & Action Plan:** The user selects their preferred path, triggering a new AI generation step using GEMINI_REASONING_MODEL. This call generates a **single, comprehensive action plan** structured around milestones. As part of this process, the AI determines necessary skills and uses a function call to a backend tool that queries the **YouTube Data API** for relevant, valid learning resources.
        
    4. **Action Plan Refinement (Optional):** The user can chat with "Nami" again to refine the detailed action plan.
        
    5. **Export:** The user can export their results or action plan to PDF.
        
- **System Architecture:**
    
    - **Frontend:** React SPA (Vite, TypeScript), using TanStack Query for server state. UI built with shadcn/ui and Tailwind CSS.
        
    - **Backend:** Node.js server (Express), orchestrating the AI generation logic.
        
    - **AI & Data:** A dual-model strategy using **`GEMINI_REASONING_MODEL`** for high-quality reasoning and JSON output, and `GEMINI_FACTS_MODEL` with search for fact-retrieval. Real-time video data is sourced from the **YouTube Data API**.
        
    - **Data Persistence:** For the MVP, session data is stored in-memory (`MemStorage`). The schema is designed for a seamless transition to PostgreSQL.
        
    - **Deployment:** The application is packaged for deployment on Replit.
Code snippet

```
graph TD
    subgraph "Browser (Client)"
        C1[React SPA] -->|HTTPS| S1(Express Server)
    end

    subgraph "Replit Environment (Server)"
        S1 -- "/api/analyze" --> ORC(Orchestrator)

        subgraph "AI Chain (Purpose Discovery)"
            ORC -- "User Profile" --> CALL2(② Gemini 1.5 Pro Reasoning + JSON)
            ORC -- "Career Titles for Grounding" --> CALL1(① Flash-Lite + Search)
            CALL1 -- "Live Salary Data + Source URL" --> FUNC_CALL(Salary Data)
            FUNC_CALL -- "Function Call" --> CALL2
        end
        
        S1 -- "/api/action-plan" --> ORC2(Orchestrator)
        subgraph "AI Chain (Action Plan)"
            ORC2 -- "Chosen Path" --> CALL3(③ Gemini 1.5 Pro Reasoning)
            CALL3 -- "Function Call: getYoutubeVideos" --> YT_API(YouTube Data API)
            YT_API -- "Video Thumbnails + URLs" --> CALL3
        end

        CALL2 --> PARSE(Validate & Persist)
        CALL3 --> PARSE2(Validate & Persist)
        PARSE --> S1
        PARSE2 --> S1
    end

    style ORC fill:#d5e8d4,stroke:#333
    style ORC2 fill:#d5e8d4,stroke:#333
    style CALL1 fill:#fff0cc,stroke:#333
    style CALL2 fill:#f8cecc,stroke:#333
    style CALL3 fill:#f8cecc,stroke:#333
    style YT_API fill:#e1d5e7,stroke:#333
```

## 2. Project Structure

The project will be organized with a clear separation of concerns, adding more granularity to the server-side structure.

```
My_Directory_Structure/
├── client/                          # Frontend React SPA
│   └── src/
│       ├── components/
│       ├── hooks/                   # React Query hooks (split by feature)
│       ├── lib/
│       └── pages/
├── server/                          # Backend Node.js/Express server
│   ├── ai/                          # Modular AI logic directory
│   │   ├── chains/                  # Orchestrates multi-call AI sequences
│   │   │   ├── action-plan.chain.ts
│   │   │   ├── chat-refinement.chain.ts
│   │   │   └── purpose-discovery.chain.ts
│   │   ├── prompts.ts               # Manages system prompt generation & persona
│   │   ├── schemas.ts               # Zod/OpenAPI schemas for AI validation
│   │   ├── tools.ts                 # Function-calling tool definitions
│   │   ├── types.ts                 # TypeScript types for the Gemini API
│   │   └── wrapper.ts               # Low-level Gemini API client wrapper
│   ├── routes/                      # Feature-based API route handlers
│   │   ├── assessment.ts            # Handles /analyze and /action-plan
│   │   └── chat.ts                  # Handles /chat
│   ├── cache.ts                     # In-memory cache implementation
│   └── storage.ts                   # In-memory session storage
├── shared/                          # Isomorphic code
│   └── schema.ts                    # Drizzle/Zod schemas
└── .env.example
```

## 3. Feature Specification

### 3.1 Purpose Discovery & Refinement

- **User Story:** As a user, I want to answer a questionnaire and receive three personalized career paths that include integrated, realistic salary expectations.
    
- **Implementation Steps (The Two-Call Chain):**
    
    1. The client sends a `POST` request to `/api/analyze`.
        
    2. The server's orchestrator in `server/ai/chains/purpose-discovery.chain.ts` initiates two parallel processes.
        
    3. **Call 1 (`GEMINI_FACTS_MODEL`):** A prompt is sent with search enabled to find a **single, broad salary range** for an analogous, standard job title related to the user's profile, along with source URLs.
        
    4. **Call 2 (`GEMINI_REASONING_MODEL`):** The main reasoning process begins. The prompt includes the user's questionnaire, the Nami persona, and a tool definition for `getSalaryDataForCareers`.
        
    5. Once Call 1 returns the salary data, the orchestrator uses it to resolve the function call for Call 2.
        
    6. Call 2 resumes, now possessing the grounded salary fact. It synthesizes the full analysis and **embeds the salary information directly into the `ikigaiAlignment.pay` string** for each path.
        
    7. The final, structured JSON (without a top-level `salaryData` key) is returned, validated via Zod, and persisted.

### 3.2 Action Plan Generation & Refinement

- **User Story:** After choosing my path, I want a single, detailed, step-by-step action plan with a timeline, project ideas, and embedded learning resources to help me start immediately.
    
- **Implementation Steps:**
    
    1. **Selection & Navigation:** When the user clicks "Choose this Path & Get Plan" on a `PurposePath` card the **Results** page enters a full-page "Generating your plan…" state (overlay + spinner) and fires a React Query mutation (`POST /api/action-plan`).  Once the server responds and the updated session (now containing the `actionPlan`) is written to storage, the app programmatically navigates to `/action-plan`, where the plan renders instantly.  The overlay is removed only after successful navigation.
        
    2. **Generation:**
        
        - The server receives the request and calls the **`getActionPlanChain`**.
            
        - This chain uses a single call to **`GEMINI_REASONING_MODEL`** with a highly detailed prompt instructing it to generate a comprehensive plan structured with milestones, timelines, and concrete actions.
            
        - During generation, if the AI identifies a skill to learn, it invokes the `getYoutubeVideosForSkills` function. This backend function queries the **YouTube Data API** for 3 relevant videos, returning their titles, URLs, and **thumbnail URLs**.
            
        - The AI incorporates these videos into the relevant steps of the action plan.
            
        - The server validates the final complex JSON object, saves the `actionPlan` to storage, and returns the updated session.
            
    3. **Refinement:**
        
        - The Action Plan page provides a "Refine with Nami" button.
            
        - This opens the `ChatInterface` component. The chat is now a **standard non-streaming request-response** interaction to improve stability.
            

---

## **4. Database Schema**

The schema is simplified, with salary data being ephemeral and the action plan structure becoming more complex.

### **4.1 Tables**

- **`assessment_sessions`**: Stores the top-level session information.
    
    - `id`: `serial` (PK)
        
    - `session_id`: `text` (UNIQUE, NOT NULL)
        
    - `language`: `text` (NOT NULL, 'en' or 'es')
        
    - `responses`: `jsonb`
        
    - `core_drivers_analysis`: `jsonb`
        
    - `chosen_path_id`: `integer` (FK to `purpose_paths.id`, NULLABLE)
        
    - `action_plan`: **`jsonb`** (Stores the new, detailed action plan with milestones, e.g., `{ milestones: [{ title: string, timeline: string, actions: string[], skills: [{...}] }] }`)
        
    - `created_at`: `timestamptz`
        
    - `updated_at`: `timestamptz`
        
- **`purpose_paths`**: Stores the three generated paths.
    
    - `id`: `serial` (PK)
        
    - `session_id`: `integer` (FK to `assessment_sessions.id` ON DELETE CASCADE)
        
    - `title`: `text`
        
    - `description`: `text`
        
    - `ikigai_alignment`: **`jsonb`** (The `pay` property within this object now contains the full narrative text about salary, including source URLs).
        
    - `action_strategy`: `text`
        
- **`salary_data`**: ~~This table is **removed** from the schema.~~
    
- **`chat_messages`**: Stores all chat history. (No changes).
    

---

## **5. Server Actions & AI Strategy**

### **5.1 AI Implementation Strategy**

The strategy is updated to leverage the best model for each task while simplifying the final output.

#### **Recommended Pairing for Purpose Discovery**

|Call|Purpose|Model|Why this is the best fit|
|---|---|---|---|
|**Call 1 – "Facts"**|• Use **Search tool** to fetch a **single, broad salary range** + citation URL for an analogous job title.  <br>• Free-form text output is sufficient.|**`GEMINI_FACTS_MODEL`**|_Cost/speed first._ A cheap, fast model is perfect for this simple, single-purpose fact-retrieval task. Grounding ensures reliability.|
|**Call 2 – "Reasoning + JSON"**|• Combine user questionnaire + salary facts.  <br>• Perform high-level synthesis and reasoning.  <br>• **Embed salary facts into a narrative** within the final JSON.  <br>• Return strict JSON adhering to the `purposeDiscoveryOpenApiSchema`.|**`GEMINI_REASONING_MODEL`**|_Quality first._ We need the best possible reasoning to synthesize the user's answers into novel insights and to elegantly weave the factual data into the final output. This model provides that capability.|

Export to Sheets

#### **Strategy for Action Plan Generation**

- **Single, Powerful Call:** The entire action plan is generated in a single call to **`GEMINI_REASONING_MODEL`** to ensure coherence and maintain a consistent narrative throughout the detailed plan.
    
- **Tool-Augmented, Not Search-Reliant:** The AI's primary job is reasoning. It offloads specific data lookups to a more reliable tool.
    
- **YouTube Data API for Grounding:** For learning resources, the AI determines the _skill_, and a backend function calls the **YouTube Data API**. This provides valid links and rich metadata (like thumbnails), which is a significant quality improvement over general web search.
### 5.2 Gemini Wrapper (`server/ai/wrapper.ts`)

- **Description:** A low-level client for the Gemini API.
- **Functions:** Will include methods for `generateContent` and `generateContentWithTools`, handling authentication, request body formation, and basic error parsing.

### 5.3 Chain Orchestrator (`server/ai/chains.ts`)

- **Description:** Contains the high-level business logic for executing the multi-call sequences. This logic is broken down into separate files by feature within the `server/ai/chains/` directory for modularity.
- `purpose-discovery.chain.ts`: Implements the parallel execution, caching, and function-calling logic for the initial analysis.
- `action-plan.chain.ts`: A similar chain for generating the detailed action plan for a chosen path.
- `chat-refinement.chain.ts`: Handles both general and path-specific chat conversations, modifying the AI prompt based on the context provided.

## 6. Design System

### 6.1 Visual Style

|Token|Hex|Description|
|---|---|---|
|`--primary`|`#3B82F6`|Main interactive elements, links.|
|`--secondary`|`#8B5CF6`|Secondary accents, part of gradients.|
|`--accent`|`#F59E0B`|Highlighting secondary info (e.g., icons on welcome page).|
|`--success`|`#10B981`|Success states, positive feedback.|
|`--background`|`#F8FAFC`|Main page background color.|
|`--gradient-primary`|-|`linear-gradient(135deg, var(--primary), var(--secondary))`|

Export to Sheets

- **Typography:** Inter (weights 300-700). Base size 16px, with a 1.25x scale for headings.
    
- **Layout:** 4-point grid system for spacing. Cards and buttons feature a large corner radius (`--radius: 0.75rem`).
    

### 6.2 Core Components

- **Layout:** `Header`, `Main Content`, `Footer` (implicit).
    
- **Interactive:** `Button`, `QuestionCard`, `ChatInterface`, `PurposePaths` cards.
    
- **Display:** `CoreDriversSummary`, `SalaryBenchmarks` table, `ActionPlan` view.
    
- **States:** Interactive components will have clear `hover`, `focus`, `active`, and `disabled` states as provided by `shadcn/ui`, ensuring accessibility (WCAG 2.1 AA).

## 7. Component Architecture

- **`ChatInterface.tsx` Component:**
    - This component is now fully reusable for different chat contexts.
    - **Props:**
		interface ChatInterfaceProps {
		  isOpen: boolean;
		  onClose: () => void;
		  sessionId: string;
		  language: Language;
		  // Determines the general conversational context for the AI.
		  context: 'discovery' | 'action_plan';
		  // NEW: Optional ID for refining a single purpose path.
		  pathId?: number | null;
		}
- **Error Handling:** Components will be wrapped in a React `<ErrorBoundary>` to gracefully handle rendering errors without crashing the application.

## 8. Authentication & Authorization

- **MVP Strategy:** No user accounts. Session is anonymous and identified by `sessionId`.
- **Session Token:** The `sessionId` will be stored in both `sessionStorage` for client-side access and a `httpOnly`, `SameSite=Lax` cookie.

## 9. Data Flow

- **Client ↔ Server:** REST API calls for primary actions. The complexity of the AI chain is fully abstracted behind a single API endpoint (e.g., `/api/analyze`).
- **Server-Side:** The internal data flow is now a parallel process orchestrated by `server/ai/chains.ts`, involving the cache and two distinct AI model calls.
- **State Management:** No changes. TanStack Query remains the source of truth for server data on the client, regardless of how that data was generated on the backend.

## 10. Environment Variables

The application will require the following environment variables to be set in `.env.local`.

- `GEMINI_API_KEY`: The API key for Google AI Studio.
    
- `GEMINI_REASONING_MODEL`: The identifier for the main analysis model. 
    
- `GEMINI_FACTS_MODEL`: The identifier for the fact-retrieval model. 
    
- `YOUTUBE_API_KEY`: A valid API key from the Google Cloud Console with the YouTube Data API v3 enabled.