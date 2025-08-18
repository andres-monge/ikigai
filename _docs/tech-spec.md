# Purpose Finder Technical Specification

# Project Name
Purpose Finder

## Project Description
An AI-powered web application designed to help career-switchers and students find their *ikigai* (a reason for being) and navigate their career path. The application, guided by an AI persona, will go beyond simple skills-matching to incorporate a user's core values, personality, and life priorities. The MVP will focus on delivering three distinct and actionable ikigai-aligned career paths based on a comprehensive user assessment. The user will select one and then the app will deliver an action plan for that path. The platform will be fully bilingual (English and Spanish) from launch.

## Target Audience
- Career-switchers and students, treated as a unified group for the MVP.

## Desired Features
### Purpose Discovery
- [ ] User completes a structured, multi-part questionnaire to identify their passions, skills, values, and economic needs.
- [ ] The AI analyzes the user's input with **word-by-word streaming** for real-time feedback.
- [ ] The system generates and displays a summary of the user's core drivers (Passion, Ability, Positive Impact, Economics).
- [ ] The system presents three distinct "Purpose Paths" for the user to choose from.
    - [ ] Each path includes a title, a short description, and a breakdown of how it aligns with the four ikigai dimensions (Passion, Ability, Positive Impact, Economics).
    - [ ] Each path includes a high-level action plan or strategy (e.g., "Bootstrapped MVP in 6 mo").
- [ ] The system provides a comparative table with estimated salary ranges for the suggested paths, generated using real-time web search to ensure data is current and localized.
    - [ ] The AI must cite the URLs of its sources for the salary data.
- [ ] User can export their results page to a PDF document.

### Action Plan & Guidance 
- [ ] Once a user selects a path, the AI generates a detailed, step-by-step action plan with a timeline using **word-by-word streaming**.
- [ ] The action plan MUST include the following sections: Side project ideas, Skills to learn, Where to find the people that can tell you more about that path).
- [ ] For each skill in the Skills section, the system recommends the 3 most relevant YouTube videos to learn that skill.
- [ ] User can export their action plan page to a PDF document.

### Personality and Reasoning
- [ ] AI persona's personality and writing will mimic that of Paul Graham. It will use the principles outlined in these Paul Graham essays to decide which Purpose Paths it should present to the user. It will also use the essays to encourage and explain the why behind every suggestion made to the user in all interactions.
	- What to Do
	- How to Do What You Love
	- When To Do What You Love
	- How to Do Great Work
	- What You'll Wish You'd Known
	- How to Be an Expert in a Changing World
- [ ] The web application will be built and deployed using Replit.

### General
- [ ] No user accounts will be required for the MVP; user session data will be stored temporarily in **Replit KV storage**.
- [ ] Full bilingual support for English and Spanish across the entire user interface and AI interactions from day one.
- [ ] **Concurrency limiting** to prevent AI API overload and ensure system stability.

## Design Requests
- [ ] Sleek and modern UI. Responsive and mobile-friendly.
- [ ] The output of the ikigai analysis should be clearly structured and presented in a format similar to the user's example.
    - [ ] A summary section ("What's popping out of your answers").
    - [ ] A clear, table-based comparison of the three ikigai options.
    - [ ] A secondary table providing salary benchmarks.


## 1. System Overview

- **Core Purpose and Value Proposition:** An AI-powered web application to help users find their _ikigai_. It provides three personalized career paths based on a user's profile. Upon selection of a path, it generates a **single, detailed, step-by-step action plan with timelines and milestones**. The entire experience is bilingual (English/Spanish) and features **real-time word-by-word streaming** for enhanced user engagement.
    
- **Key Workflows:**
    
    1. **Assessment & Discovery:** The user completes a questionnaire. The system initiates a two-call AI process: a fast, lightweight call (GEMINI_FACTS_MODEL) with search grounding retrieves real-time salary data for analogous standard jobs. A parallel, more powerful call (GEMINI_REASONING_MODEL) performs the core analysis, consuming the salary data via function calling to produce the final "Core Drivers" summary and three "Purpose Paths". **The salary data is embedded directly into the narrative of each path, not as a separate data object.** The entire process streams word-by-word to the client for real-time feedback.
    
    2. **Path Selection & Action Plan:** The user selects their preferred path, triggering a new AI generation step using GEMINI_REASONING_MODEL. This call generates a **single, comprehensive action plan** structured around milestones with **word-by-word streaming**. As part of this process, the AI determines necessary skills and uses a function call to a backend tool that queries the **YouTube Data API** for relevant, valid learning resources.
        
    3. **Export:** The user can export their results or action plan to PDF.
        
- **System Architecture:**
    
    - **Frontend:** React SPA (Vite, TypeScript), using TanStack Query for server state. UI built with shadcn/ui and Tailwind CSS. **Enhanced with Server-Sent Events (SSE) for real-time streaming**.
        
    - **Backend:** Node.js server (Express), orchestrating the AI generation logic with **concurrency limiting** and **streaming endpoints**.
        
    - **AI & Data:** A dual-model strategy using **`GEMINI_REASONING_MODEL`** for high-quality reasoning and JSON output, and `GEMINI_FACTS_MODEL` with search for fact-retrieval. Real-time video data is sourced from the **YouTube Data API**.
        
    - **Data Persistence:** **Replit KV storage** with prefixed key structure for session management. The schema is designed for a seamless transition to PostgreSQL.
        
    - **Deployment:** The application is packaged for deployment on Replit.
    
    - **Testing:** Comprehensive testing with **Vitest** for unit tests, **Playwright** for end-to-end testing, and integration tests for streaming endpoints.

```
graph TD
    subgraph "Browser (Client)"
        C1[React SPA] -->|HTTPS| S1(Express Server)
        C1 -->|SSE| S1
    end

    subgraph "Replit Environment (Server)"
        S1 -- "/api/analyze/stream" --> ORC(Orchestrator)
        S1 -- "/api/action-plan/stream" --> ORC2(Orchestrator)

        subgraph "AI Chain (Purpose Discovery)"
            ORC -- "User Profile" --> CALL2(② Gemini 1.5 Pro Reasoning + JSON)
            ORC -- "Career Titles for Grounding" --> CALL1(① Flash-Lite + Search)
            CALL1 -- "Live Salary Data + Source URL" --> FUNC_CALL(Salary Data)
            FUNC_CALL -- "Function Call" --> CALL2
            CALL2 -- "Word-by-word stream" --> SSE(Server-Sent Events)
        end
        
        subgraph "AI Chain (Action Plan)"
            ORC2 -- "Chosen Path" --> CALL3(③ Gemini 1.5 Pro Reasoning)
            CALL3 -- "Function Call: getYoutubeVideos" --> YT_API(YouTube Data API)
            YT_API -- "Video Thumbnails + URLs" --> CALL3
            CALL3 -- "Word-by-word stream" --> SSE2(Server-Sent Events)
        end

        CALL2 --> PARSE(Validate & Persist to KV)
        CALL3 --> PARSE2(Validate & Persist to KV)
        PARSE --> S1
        PARSE2 --> S1
        
        subgraph "Storage Layer"
            KV(Replit KV Storage)
            LIMITER(Concurrency Limiter)
        end
        
        ORC --> LIMITER
        ORC2 --> LIMITER
        PARSE --> KV
        PARSE2 --> KV
    end

    style ORC fill:#d5e8d4,stroke:#333
    style ORC2 fill:#d5e8d4,stroke:#333
    style CALL1 fill:#fff0cc,stroke:#333
    style CALL2 fill:#f8cecc,stroke:#333
    style CALL3 fill:#f8cecc,stroke:#333
    style YT_API fill:#e1d5e7,stroke:#333
    style SSE fill:#d4edda,stroke:#333
    style SSE2 fill:#d4edda,stroke:#333
    style KV fill:#f8d7da,stroke:#333
    style LIMITER fill:#fff3cd,stroke:#333
```

## 2. Project Structure

The project will be organized with a clear separation of concerns, adding more granularity to the server-side structure and **streaming capabilities**.

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
│   │   │   ├── action-plan.stream.chain.ts  # ✨ NEW: Streaming version
│   │   │   ├── purpose-discovery.chain.ts
│   │   │   ├── purpose-discovery.stream.chain.ts  # ✨ NEW: Streaming version
│   │   │   ├── index.ts
│   │   │   └── limiter.ts           # ✨ NEW: Concurrency control
│   │   ├── prompts.ts               # Manages system prompt generation & persona
│   │   ├── schemas.ts               # Zod/OpenAPI schemas for AI validation
│   │   ├── tools.ts                 # Function-calling tool definitions
│   │   ├── types.ts                 # TypeScript types for the Gemini API
│   │   └── wrapper.ts               # Low-level Gemini API client wrapper
│   ├── routes/                      # Feature-based API route handlers
│   │   ├── assessment.ts            # Handles /analyze and /action-plan
│   │   ├── session.ts               # ✨ NEW: Session management endpoints
│   │   └── assessment.stream.test.ts # ✨ NEW: Streaming endpoint tests
│   ├── services/                    # External API service abstractions
│   │   ├── index.ts                 # Service exports
│   │   ├── salary.ts                # Salary data fetching service
│   │   └── youtube.ts               # YouTube API service
│   ├── cache.ts                     # In-memory cache implementation
│   ├── storage.ts                   # ✨ UPDATED: Replit KV storage implementation
│   └── storage.test.ts              # ✨ NEW: Storage unit tests
├── shared/                          # Isomorphic code
│   └── schema.ts                    # Drizzle/Zod schemas
├── tests/                           # ✨ NEW: E2E test directory
│   └── journey.spec.ts              # ✨ NEW: Full user journey test
├── _docs/                           # Documentation
│   ├── tech-spec.md                 # This file
│   ├── implementation-plan.md       # Implementation roadmap
│   └── manual-test-harness.ts      # ✨ NEW: Developer testing tool
├── vitest.config.ts                 # ✨ NEW: Vitest configuration
├── playwright.config.ts             # ✨ NEW: Playwright configuration
└── .env.example
```

## 3. Feature Specification

### 3.1 Purpose Discovery

- **User Story:** As a user, I want to answer a questionnaire and receive three personalized career paths that include integrated, realistic salary expectations, with **real-time word-by-word streaming** for an engaging experience.
    
- **Implementation Steps (The Two-Call Chain with Streaming):**
    
    1. The client sends a `POST` request to `/api/analyze/stream` and establishes an SSE connection.
        
    2. The server's orchestrator in `server/ai/chains/purpose-discovery.stream.chain.ts` initiates two parallel processes with **concurrency limiting**.
        
    3. **Call 1 (`GEMINI_FACTS_MODEL`):** A prompt is sent with search enabled to find a **single, broad salary range** for an analogous, standard job title related to the user's profile, along with source URLs.
        
    4. **Call 2 (`GEMINI_REASONING_MODEL`):** The main reasoning process begins with **word-by-word streaming**. The prompt includes the user's questionnaire, the AI persona, and a tool definition for `getSalaryDataForCareers`.
        
    5. Once Call 1 returns the salary data, the orchestrator uses it to resolve the function call for Call 2.
        
    6. Call 2 resumes, now possessing the grounded salary fact. It synthesizes the full analysis and **embeds the salary information directly into the `ikigaiAlignment.pay` string** for each path, **streaming each word as it's generated**.
        
    7. The final, structured JSON (without a top-level `salaryData` key) is returned, validated via Zod, and persisted to **Replit KV storage**.
        
    8. The client receives the streamed content in real-time, parsing section delimiters to progressively render completed sections.

### 3.2 Action Plan Generation

- **User Story:** After choosing my path, I want a single, detailed, step-by-step action plan with a timeline, project ideas, and embedded learning resources to help me start immediately, delivered with **word-by-word streaming**.
    
- **Implementation Steps:**
    
    1. **Selection & Navigation:** When the user clicks "Choose this Path & Get Plan" on a `PurposePath` card the **Results** page enters a full-page "Generating your plan…" state (overlay + spinner) and establishes an SSE connection to `/api/action-plan/stream`. Once the server responds and the updated session (now containing the `actionPlan`) is written to **KV storage**, the app programmatically navigates to `/action-plan`, where the plan renders instantly. The overlay is removed only after successful navigation.
        
    2. **Generation:**
        
        - The server receives the request and calls the **`getActionPlanStreamChain`** with **concurrency limiting**.
            
        - This chain uses a single call to **`GEMINI_REASONING_MODEL`** with a highly detailed prompt instructing it to generate a comprehensive plan structured with milestones, timelines, and concrete actions, **streaming word-by-word**.
            
        - During generation, if the AI identifies a skill to learn, it invokes the `getYoutubeVideosForSkills` function. This backend function queries the **YouTube Data API** for 3 relevant videos, returning their titles, URLs, and **thumbnail URLs**.
            
        - The AI incorporates these videos into the relevant steps of the action plan, **streaming the content as it's generated**.
            
        - The server validates the final complex JSON object, saves the `actionPlan` to **KV storage**, and returns the updated session.
            
        - The client receives the streamed content in real-time, parsing section delimiters to progressively render completed sections.

### 3.3 Session Management

- **User Story:** As a user, I want to be able to start over my assessment or retrieve my session data at any time.
    
- **Implementation Steps:**
    
    1. **Session Retrieval:** `GET /api/session/:sessionId` endpoint retrieves and returns the fully hydrated session data from **Replit KV storage**.
        
    2. **Start Over:** `POST /api/session/start-over` endpoint uses `db.list(prefix)` to find all keys for a `sessionId` and deletes them from **KV storage**.
        
    3. **Frontend Integration:** The `handleStartOver` function in `client/src/App.tsx` calls the new "start-over" endpoint.

---

## **4. Database Schema**

The schema is simplified, with salary data being ephemeral and the action plan structure becoming more complex. **Storage is now handled by Replit KV with prefixed keys**.

### **4.1 Replit KV Storage Structure**

- **Key Pattern:** `sess:<sessionId>:<dataType>`
  - `sess:<sessionId>:core` - Core session data
  - `sess:<sessionId>:paths` - Purpose paths array
  - `sess:<sessionId>:action-plan` - Action plan data

### **4.2 Data Types (In-Memory Representation)**

- **`AssessmentSession`**: Stores the top-level session information.
    
    - `id`: `number` (PK)
        
    - `sessionId`: `string` (UNIQUE, NOT NULL)
        
    - `language`: `string` (NOT NULL, 'en' or 'es')
        
    - `responses`: `object`
        
    - `coreDriversAnalysis`: `object`
        
    - `chosenPathId`: `number` (FK to `purposePaths.id`, NULLABLE)
        
    - `actionPlan`: **`object`** (Stores the new, detailed action plan with milestones, e.g., `{ milestones: [{ title: string, timeline: string, actions: string[], skills: [{...}] }] }`)
        
    - `createdAt`: `Date`
        
    - `updatedAt`: `Date`
        
- **`PurposePath`**: Stores the three generated paths.
    
    - `id`: `number` (PK)
        
    - `sessionId`: `number` (FK to `assessmentSessions.id` ON DELETE CASCADE)
        
    - `title`: `string`
        
    - `description`: `string`
        
    - `ikigaiAlignment`: **`object`** (The `pay` property within this object now contains the full narrative text about salary, including source URLs).
        
    - `actionStrategy`: `string`
        
- **`HydratedAssessmentSession`**: A fully-resolved session that contains the base `AssessmentSession` columns plus an array of all `PurposePath` rows belonging to the session.

---

## **5. Server Actions & AI Strategy**

### **5.1 AI Implementation Strategy**

The strategy is updated to leverage the best model for each task while simplifying the final output and **adding streaming capabilities**.

#### **Recommended Pairing for Purpose Discovery**

|Call|Purpose|Model|Why this is the best fit|
|---|---|---|---|
|**Call 1 – "Facts"**|• Use **Search tool** to fetch a **single, broad salary range** + citation URL for an analogous job title.  <br>• Free-form text output is sufficient.|**`GEMINI_FACTS_MODEL`**|_Cost/speed first._ A cheap, fast model is perfect for this simple, single-purpose fact-retrieval task. Grounding ensures reliability.|
|**Call 2 – "Reasoning + JSON + Streaming"**|• Combine user questionnaire + salary facts.  <br>• Perform high-level synthesis and reasoning.  <br>• **Embed salary facts into a narrative** within the final JSON.  <br>• **Stream word-by-word** for real-time user engagement.  <br>• Return strict JSON adhering to the `purposeDiscoveryOpenApiSchema`.|**`GEMINI_REASONING_MODEL`**|_Quality first._ We need the best possible reasoning to synthesize the user's answers into novel insights and to elegantly weave the factual data into the final output. This model provides that capability plus streaming support.|

#### **Strategy for Action Plan Generation**

- **Single, Powerful Call with Streaming:** The entire action plan is generated in a single call to **`GEMINI_REASONING_MODEL`** with **word-by-word streaming** to ensure coherence and maintain a consistent narrative throughout the detailed plan while providing real-time feedback.
    
- **Tool-Augmented, Not Search-Reliant:** The AI's primary job is reasoning. It offloads specific data lookups to a more reliable tool.
    
- **YouTube Data API for Grounding:** For learning resources, the AI determines the _skill_, and a backend function calls the **YouTube Data API**. This provides valid links and rich metadata (like thumbnails), which is a significant quality improvement over general web search.

### **5.2 Concurrency Limiting**

- **Purpose:** Prevent AI API overload and ensure system stability during high traffic.
- **Implementation:** Using `p-limit` library to create a limiter instance (e.g., `const aiLimiter = pLimit(5);`).
- **Usage:** All AI-powered routes are wrapped within the limiter to control concurrent requests.

### 5.3 Chain Orchestrator (`server/ai/chains/`)

- **Description:** Contains the high-level business logic for executing the multi-call sequences with **streaming support**. This logic is broken down into separate files by feature within the `server/ai/chains/` directory for modularity.
- `purpose-discovery.chain.ts`: Implements the parallel execution, caching, and function-calling logic for the initial analysis.
- `purpose-discovery.stream.chain.ts`: **NEW** - Streaming version with word-by-word output.
- `action-plan.chain.ts`: A similar chain for generating the detailed action plan for a chosen path.
- `action-plan.stream.chain.ts`: **NEW** - Streaming version with word-by-word output.
- `limiter.ts`: **NEW** - Concurrency control for AI routes.

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

- **Typography:** Inter (weights 300-700). Base size 16px, with a 1.25x scale for headings.
    
- **Layout:** 4-point grid system for spacing. Cards and buttons feature a large corner radius (`--radius: 0.75rem`).
    
- **Streaming UI:** **NEW** - Progressive content rendering with loading states and section delimiters for real-time feedback.

### 6.2 Core Components

- **Layout:** `Header`, `Main Content`, `Footer` (implicit).
    
- **Interactive:** `Button`, `QuestionCard`, `PurposePaths` cards.
    
- **Display:** `CoreDriversSummary`, `SalaryBenchmarks` table, `ActionPlan` view.
    
- **Streaming:** **NEW** - `StreamingContent`, `SectionParser`, `ProgressIndicator` components for real-time content rendering.
    
- **States:** Interactive components will have clear `hover`, `focus`, `active`, and `disabled` states as provided by `shadcn/ui`, ensuring accessibility (WCAG 2.1 AA).

## 7. Component Architecture

- **Error Handling:** Components will be wrapped in a React `<ErrorBoundary>` to gracefully handle rendering errors without crashing the application.
    
- **Streaming Integration:** **NEW** - Frontend pages (`results.tsx`, `action-plan.tsx`) will handle word-by-word streams using `EventSource` and progressive content rendering.

## 8. Authentication & Authorization

- **MVP Strategy:** No user accounts. Session is anonymous and identified by `sessionId`.
- **Session Token:** The `sessionId` will be stored in both `sessionStorage` for client-side access and a `httpOnly`, `SameSite=Lax` cookie.
- **Storage:** **UPDATED** - Session data is now stored in **Replit KV storage** with prefixed keys for efficient retrieval and management.

## 9. Data Flow

- **Client ↔ Server:** REST API calls for primary actions with **Server-Sent Events (SSE)** for streaming. The complexity of the AI chain is fully abstracted behind streaming endpoints (e.g., `/api/analyze/stream`, `/api/action-plan/stream`).
- **Server-Side:** The internal data flow is now a parallel process orchestrated by `server/ai/chains/` with **concurrency limiting**, involving the cache and two distinct AI model calls with **word-by-word streaming**.
- **State Management:** TanStack Query remains the source of truth for server data on the client, with **enhanced support for streaming data**.
- **Storage:** **UPDATED** - All session data is persisted to **Replit KV storage** with efficient key-based retrieval.

## 10. Testing Strategy

### **10.1 Unit Testing**
- **Framework:** Vitest for fast, reliable unit tests.
- **Coverage:** Storage layer (`ReplitKVStorage`), AI chains, and utility functions.
- **Mocking:** External dependencies (AI APIs, YouTube API) are mocked for reliable testing.

### **10.2 Integration Testing**
- **Framework:** Vitest with supertest for API endpoint testing.
- **Coverage:** Streaming endpoints (`/api/analyze/stream`, `/api/action-plan/stream`).
- **Validation:** SSE message format, content parsing, and error handling.

### **10.3 End-to-End Testing**
- **Framework:** Playwright for full user journey testing.
- **Coverage:** Complete user flow from questionnaire to action plan with streaming validation.
- **Validation:** Real-time content rendering, navigation, and data persistence.

### **10.4 Manual Testing**
- **Tool:** `_docs/manual-test-harness.ts` for controlled edge-case testing.
- **Purpose:** Developer tool for testing difficult inputs and isolating issues.

## 11. Environment Variables

The application will require the following environment variables to be set in `.env.local`.

- `GEMINI_API_KEY`: The API key for Google AI Studio.
    
- `GEMINI_REASONING_MODEL`: The identifier for the main analysis model. 
    
- `GEMINI_FACTS_MODEL`: The identifier for the fact-retrieval model. 
    
- `YOUTUBE_API_KEY`: A valid API key from the Google Cloud Console with the YouTube Data API v3 enabled.
    
- `REPLIT_DB_URL`: **NEW** - The Replit database URL for KV storage (must be set manually in Replit Secrets).

## 12. Performance & Scalability

### **12.1 Concurrency Management**
- **AI Route Limiting:** Maximum 5 concurrent AI requests to prevent API overload.
- **Streaming Efficiency:** Word-by-word streaming reduces perceived latency and improves user engagement.

### **12.2 Storage Optimization**
- **KV Storage:** Efficient key-based retrieval with prefixed structure.
- **Session Cleanup:** Automatic cleanup of old sessions to prevent storage bloat.

### **12.3 Caching Strategy**
- **In-Memory Cache:** Frequently accessed data cached in memory for faster response times.
- **AI Response Caching:** Cached AI responses to reduce API calls for similar inputs.