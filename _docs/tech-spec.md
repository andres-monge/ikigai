# Ikigai Finder Technical Specification

# Project Name

Ikigai Finder

## Project Description

An AI-powered web application designed to help career-switchers and students find their *ikigai* (a reason for being) and navigate their career path. The application, guided by an AI persona, will go beyond simple skills-matching to incorporate a user's core values, personality, and life priorities. The MVP will focus on delivering three distinct and actionable ikigai-aligned career paths based on a comprehensive user assessment. The user will select one and then the app will deliver an action plan for that path. The user experience is built around a real-time, word-by-word streaming interface, where results and plans are generated and displayed progressively. The platform will be fully bilingual (English and Spanish) from launch.

## Target Audience

  - Career-switchers and students, treated as a unified group for the MVP.

## Desired Features

### Purpose Discovery

  - [ ] User completes a structured, multi-part questionnaire to identify their passions, skills, values, and economic needs.
  - [ ] The AI analyzes the user's input.
  - [ ] The system generates and displays a summary of the user's core drivers.
  - [ ] The system presents three distinct "Purpose Paths" for the user to choose from.
  - [ ] Each path includes a title, a short description, and a breakdown of how it aligns with the four ikigai dimensions.
  - [ ] Each path includes a button to proceed to an action plan.
  - [ ] User can export their results page to a PDF document.

### Action Plan & Guidance

  - [ ] Once a user selects a path, the AI generates a detailed, step-by-step action plan with a timeline.
  - [ ] For each skill in the Skills section, the system recommends the 3 most relevant YouTube videos to learn that skill.
  - [ ] User can export their action plan page to a PDF document.

### Personality and Reasoning

  - [ ] AI persona's personality and writing will mimic that of Paul Graham. It will encourage and explain the why behind every suggestion made to the user in all interactions.
  - [ ] The web application will be built and deployed using Replit.

### General

  - [ ] No user accounts will be required for the MVP; user session data will be stored persistently in a PostgreSQL database, identified by an anonymous session ID.
  - [ ] Full bilingual support for English and Spanish across the entire user interface and AI interactions from day one.

## 1\. System Overview

  - **Core Purpose and Value Proposition:** An AI-powered web application to help users find their *ikigai*. It provides three personalized career paths based on a user's profile. Upon selection of a path, it generates a single, detailed, step-by-step action plan with timelines and milestones. All AI-generated content is delivered via a real-time streaming interface. The entire experience is bilingual (English/Spanish).

  - **Key Workflows:**

    1.  **Assessment & Discovery:** The user completes a questionnaire. The system initiates a two-call AI process: a fast, lightweight call (GEMINI\_FACTS\_MODEL) with search grounding retrieves real-time salary data for analogous standard jobs. A parallel, more powerful call (GEMINI\_REASONING\_MODEL) performs the core analysis, consuming the salary data via function calling to produce the final "Core Drivers" summary and three "Purpose Paths". The salary data is embedded directly into the narrative of each path, not as a separate data object. After the user submits the questionnaire, the frontend immediately navigates to /results. It initiates a connection to a streaming endpoint (/api/analyze/stream). The backend orchestrates an AI chain that generates the analysis as a continuous stream of text, using delimiters to separate sections (e.g., [SECTION:CORE_DRIVERS]). The client progressively parses and renders this content, replacing skeletons with the live text as it arrives. Upon stream completion, the full result is persisted to the database.
    2.  **Path Selection & Action Plan:** The user selects their preferred path, triggering a new AI generation step using GEMINI\_REASONING\_MODEL. This call generates a single, comprehensive action plan structured around milestones. As part of this process, the AI determines necessary skills and uses a function call to a backend tool that queries the YouTube Data API for relevant, valid learning resources. The user selects their preferred path, which immediately navigates them to /action-plan. This page connects to a new streaming endpoint (/api/action-plan/stream). The backend generates a comprehensive action plan as a text stream with delimiters for each milestone. The client progressively renders the plan. Once the stream is complete, the full plan is saved to the database.
    3.  **Export:** The user can export their results or action plan to PDF.

  - **System Architecture:**

      - **Frontend:** React SPA (Vite, TypeScript), using TanStack Query for server state. UI built with shadcn/ui and Tailwind CSS.
      - **Backend:** Node.js server (Express), orchestrating the AI generation logic.
      - **AI & Data:** A dual-model strategy using **`GEMINI_REASONING_MODEL`** for high-quality reasoning and JSON output, and `GEMINI_FACTS_MODEL` with search for fact-retrieval. Real-time video data is sourced from the YouTube Data API.
      - **Data Persistence:** Session data is stored in a **Replit PostgreSQL database**. Schema management and migrations are handled by **Drizzle ORM** and **Drizzle Kit**. A two-database strategy (production and development) is employed to ensure a safe workflow.
      - **Deployment:** The application is packaged for deployment on Replit.

<!-- end list -->

```mermaid
graph TD
    subgraph "Browser (Client)"
        C1[React SPA w/ EventSource] -->|HTTPS SSE| S1(Express Server)
    end

    subgraph "Replit Environment (Server)"
        S1 -- "/api/analyze/stream" --> ORC(Streaming Orchestrator)

        subgraph "AI Stream (Purpose Discovery)"
            ORC -- "User Profile" --> CALL2(② Gemini 1.5 Pro Stream)
            ORC -- "Career Titles for Grounding" --> CALL1(① Flash-Lite + Search)
            CALL1 -- "Live Salary Data" --> CALL2
        end

        S1 -- "/api/action-plan/stream" --> ORC2(Streaming Orchestrator)
        subgraph "AI Stream (Action Plan)"
            ORC2 -- "Chosen Path" --> CALL3(③ Gemini 1.5 Pro Stream)
            CALL3 -- "Tool Call: getYoutubeVideos" --> YT_API(YouTube Data API)
            YT_API -- "Video URLs" --> CALL3
        end

        subgraph "Data Persistence"
            DB[(Replit PostgreSQL)]
        end

        CALL2 -- "Full Text on Complete" --> PERSIST1(Validate & Persist)
        CALL3 -- "Full Text on Complete" --> PERSIST2(Validate & Persist)
        PERSIST1 --> DB
        PERSIST2 --> DB
    end

    style ORC fill:#d5e8d4,stroke:#333
    style ORC2 fill:#d5e8d4,stroke:#333
    style CALL1 fill:#fff0cc,stroke:#333
    style CALL2 fill:#f8cecc,stroke:#333
    style CALL3 fill:#f8cecc,stroke:#333
    style YT_API fill:#e1d5e7,stroke:#333
    style DB fill:#dae8fc,stroke:#333
```

## 2\. Project Structure

The project will be organized with a clear separation of concerns, adding more granularity to the server-side structure.

```
My_Directory_Structure/
├── client/ # Frontend React SPA
│ └── src/
│ ├── components/
│ ├── hooks/ # React Query hooks (split by feature)
│ ├── lib/
│ └── pages/
├── server/ # Backend Node.js/Express server
│ ├── ai/ # Modular AI logic directory
│ │ ├── chains/ # Orchestrates multi-call AI sequences
│ │ │ ├── aaction-plan.chain.ts
│ │ │ ├── action-plan.stream.chain.ts # Logic for streaming action plan
│ │ │ ├── index.ts
│ │ │ └── purpose-discovery.chain.ts
│ │ │ └── purpose-discovery.stream.chain.ts # Logic for streaming results
│ │ ├── prompts.ts # Manages system prompt generation & persona
│ │ ├── schemas.ts # Zod/OpenAPI schemas for AI validation
│ │ ├── tools.ts # Function-calling tool definitions
│ │ ├── types.ts # TypeScript types for the Gemini API
│ │ └── wrapper.ts # Low-level Gemini API client wrapper
│ ├── db.ts # Drizzle client setup and export
│ ├── routes/ # Feature-based API route handlers
│ │ └── assessment.ts # Handles /analyze/stream and /action-plan/stream
│ ├── services/ # External API service abstractions
│ │ ├── index.ts # Service exports
│ │ ├── salary.ts # Salary data fetching service
│ │ └── youtube.ts # YouTube API service
│ ├── cache.ts # In-memory cache implementation
│ └── storage.ts # PostgreSQL storage class using Drizzle
├── shared/ # Isomorphic code
│ └── schema.ts # Drizzle/Zod schemas
└── .env.example
```

## 3\. Feature Specification

### 3.1 Purpose Discovery

  - **User Story:** As a user, I want to answer a questionnaire and receive three personalized career paths that include integrated, realistic salary expectations.

  - **Implementation Steps (The Two-Call Chain):**

    1.  The client sends a `POST` request to `/api/analyze`.
    2.  The server's orchestrator in `server/ai/chains/purpose-discovery.chain.ts` initiates two parallel processes.
    3.  **Call 1 (`GEMINI_FACTS_MODEL`):** A prompt is sent with search enabled to find a **single, broad salary range** for an analogous, standard job title related to the user's profile, along with source URLs.
    4.  **Call 2 (`GEMINI_REASONING_MODEL`):** The main reasoning process begins. The prompt includes the user's questionnaire, the AI persona, and a tool definition for `getSalaryDataForCareers`.
    5.  Once Call 1 returns the salary data, the orchestrator uses it to resolve the function call for Call 2.
    6.  Call 2 resumes, now possessing the grounded salary fact. It synthesizes the full analysis and **embeds the salary information directly into the `ikigaiAlignment.pay` string** for each path.
    7.  The final, structured JSON (without a top-level `salaryData` key) is returned, validated via Zod, and persisted to the PostgreSQL database.
    
### 3.1.1 Purpose Discovery (Streaming)

  - **User Story:** As a user, I want to submit my questionnaire and instantly see my results page appear, with the analysis filling in live on the screen.

  - **Implementation Steps (Streaming):**

    1.  Navigation & Connection: The client submits the questionnaire via a standard POST to /api/analyze, which saves the responses and returns success. The client then immediately navigates to /results. The Results page component mounts, displays a skeleton UI, and uses a useEffect hook to open an EventSource connection to GET /api/analyze/stream.
    2.  Backend Generation: The server receives the request and invokes the getPurposeDiscoveryStreamChain. This chain's prompt instructs the AI to generate the analysis as a continuous stream of text, using delimiters like [SECTION:CORE_DRIVERS] and [SECTION:PATH_1] to structure the output.
    3.  Streaming: The server pipes the raw text chunks from the AI model directly to the client as Server-Sent Events (SSE).
    4.  Progressive Rendering: In the Results component, the EventSource onmessage handler appends incoming text to a local state buffer. A parsing function continuously checks this buffer for section delimiters. As each section is fully received, its content is parsed and set in state, causing React to replace the corresponding skeleton with the final, formatted component.
    5.  Persistence: When the stream completes, the server assembles the full text, validates it, and persists the final structured JSON object to the database. The client also saves the final object to sessionStorage to handle page refreshes without re-streaming.
    
### 3.2 Action Plan Generation

  - **User Story:** After choosing my path, I want a single, detailed, step-by-step action plan with a timeline, project ideas, and embedded learning resources to help me start immediately.

  - **Implementation Steps:**

    1.  **Selection & Navigation:** When the user clicks "Choose this Path & Get Plan" on a `PurposePath` card the **Results** page enters a full-page "Generating your plan…" state (overlay + spinner) and fires a React Query mutation (`POST /api/action-plan`). Once the server responds and the updated session (now containing the `actionPlan`) is written to the database, the app programmatically navigates to `/action-plan`, where the plan renders instantly. The overlay is removed only after successful navigation.
    2.  **Generation:**
          - The server receives the request and calls the **`getActionPlanChain`**.
          - This chain uses a single call to **`GEMINI_REASONING_MODEL`** with a highly detailed prompt instructing it to generate a comprehensive plan structured with milestones, timelines, and concrete actions.
          - During generation, if the AI identifies a skill to learn, it invokes the `getYoutubeVideosForSkills` function. This backend function queries the **YouTube Data API** for 3 relevant videos, returning their titles, URLs, and **thumbnail URLs**.
          - The AI incorporates these videos into the relevant steps of the action plan.
          - The server validates the final complex JSON object, saves the `actionPlan` to the database, and returns the updated session.

### 3.2.1 Action Plan Generation (Streaming)

  - **User Story:** After choosing my path, I want to be taken to my action plan immediately, where I can watch it being built step-by-step.

  - **Implementation Steps (Streaming):**

    1.  Navigation & Connection: When the user clicks "Get Action Plan," the client immediately navigates to /action-plan. The ActionPlan page component mounts, shows a skeleton UI, and opens an EventSource connection to GET /api/action-plan/stream.
    2.  Backend Generation: The server invokes the getActionPlanStreamChain. The AI is prompted to generate the plan milestone-by-milestone, using delimiters like [MILESTONE_START] and [MILESTONE_END]. Tool calling for YouTube videos happens transparently on the backend during generation.
    3. Streaming & Rendering: The server streams the plan as text chunks. The client parses each completed milestone and adds it to an array in its local state, causing the UI to render the plan progressively.
    4. Persistence: Upon stream completion, the full action plan is assembled, validated, and saved to the database by the server. The client saves the final plan to sessionStorage.

-----

## **4. Database Schema**

The schema is defined in `shared/schema.ts` using Drizzle ORM syntax for PostgreSQL.

### **4.1 Tables**

  - **`assessment_sessions`**: Stores the top-level session information.
      - `id`: `serial` (PK)
      - `session_id`: `text` (UNIQUE, NOT NULL)
      - `language`: `text` (NOT NULL, 'en' or 'es')
      - `responses`: `jsonb`
      - `core_drivers_analysis`: `jsonb`
      - `chosen_path_id`: `integer` (FK to `purpose_paths.id`, NULLABLE)
      - `action_plan`: **`jsonb`** (Stores the detailed action plan with milestones, e.g., `{ milestones: [{ title: string, timeline: string, actions: string[], skills: [{...}] }] }`)
      - `created_at`: `timestamptz` (with timezone, default now)
      - `updated_at`: `timestamptz` (with timezone, default now)
  - **`purpose_paths`**: Stores the three generated paths for a session.
      - `id`: `serial` (PK)
      - `assessment_id`: `integer` (FK to `assessment_sessions.id` ON DELETE CASCADE)
      - `title`: `text`
      - `description`: `text`
      - `ikigai_alignment`: **`jsonb`** (The `pay` property within this object now contains the full narrative text about salary, including source URLs).
      - `action_strategy`: `text`
  - **`salary_data`**: Stores salary benchmark data retrieved for each path.
      - `id`: `serial` (PK)
      - `path_id`: `integer` (FK to `purpose_paths.id` ON DELETE CASCADE)
      - `entry_level`: `text`
      - `mid_level`: `text`
      - `senior_level`: `text`
      - `location`: `text`
      - `sources`: `text[]` (array of strings)
      - `retrieved_at`: `timestamptz` (with timezone, default now)

-----

## **5. Server Actions & AI Strategy**

### **5.1 AI Implementation Strategy**

The strategy is updated to leverage the best model for each task while simplifying the final output.

#### **Recommended Pairing for Purpose Discovery**

| Call | Purpose | Model | Why this is the best fit |
| :--- | :--- | :--- | :--- |
| **Call 1 – "Facts"** | • Use **Search tool** to fetch a **single, broad salary range** + citation URL for an analogous job title. \<br\>• Free-form text output is sufficient. | **`GEMINI_FACTS_MODEL`** | *Cost/speed first.* A cheap, fast model is perfect for this simple, single-purpose fact-retrieval task. Grounding ensures reliability. |
| **Call 2 – "Reasoning + JSON"** | • Combine user questionnaire + salary facts. \<br\>• Perform high-level synthesis and reasoning. \<br\>• **Embed salary facts into a narrative** within the final JSON. \<br\>• Return strict JSON adhering to the `purposeDiscoveryOpenApiSchema`. | **`GEMINI_REASONING_MODEL`** | *Quality first.* We need the best possible reasoning to synthesize the user's answers into novel insights and to elegantly weave the factual data into the final output. This model provides that capability. |

#### **Strategy for Action Plan Generation**

  - **Single, Powerful Call:** The entire action plan is generated in a single call to **`GEMINI_REASONING_MODEL`** to ensure coherence and maintain a consistent narrative throughout the detailed plan.
  - **Tool-Augmented, Not Search-Reliant:** The AI's primary job is reasoning. It offloads specific data lookups to a more reliable tool.
  - **YouTube Data API for Grounding:** For learning resources, the AI determines the *skill*, and a backend function calls the **YouTube Data API**. This provides valid links and rich metadata (like thumbnails), which is a significant quality improvement over general web search.

### 5.3 Chain Orchestrator (`server/ai/chains/`)

  - **Description:** Contains the high-level business logic for executing the multi-call sequences, broken down into separate files by feature.
  - `purpose-discovery.chain.ts`: Implements the parallel execution, caching, and function-calling logic for the initial analysis.
  - `action-plan.chain.ts`: A similar chain for generating the detailed action plan for a chosen path.

## 6\. Design System

### 6.1 Visual Style

| Token | Hex | Description |
| :--- | :--- | :--- |
| `--primary` | `#3B82F6` | Main interactive elements, links. |
| `--secondary` | `#8B5CF6` | Secondary accents, part of gradients. |
| `--accent` | `#F59E0B` | Highlighting secondary info (e.g., icons on welcome page). |
| `--success` | `#10B981` | Success states, positive feedback. |
| `--background` | `#F8FAFC` | Main page background color. |
| `--gradient-primary` | - | `linear-gradient(135deg, var(--primary), var(--secondary))` |

  - **Typography:** Inter (weights 300-700). Base size 16px, with a 1.25x scale for headings.
  - **Layout:** 4-point grid system for spacing. Cards and buttons feature a large corner radius (`--radius: 0.75rem`).

### 6.2 Core Components

  - **Layout:** `Header`, `Main Content`, `Footer` (implicit).
  - **Interactive:** `Button`, `QuestionCard`, `PurposePaths` cards.
  - **Display:** `CoreDriversSummary`, `SalaryBenchmarks` table, `ActionPlan` view.
  - **States:** Interactive components will have clear `hover`, `focus`, `active`, and `disabled` states as provided by `shadcn/ui`, ensuring accessibility (WCAG 2.1 AA).

## 7\. Component Architecture

  - **Error Handling:** Components will be wrapped in a React `<ErrorBoundary>` to gracefully handle rendering errors without crashing the application.

## 8\. Authentication & Authorization

  - **MVP Strategy:** No user accounts. Session is anonymous and identified by `sessionId`.
  - **Session Token:** The `sessionId` will be stored in both `sessionStorage` for client-side access and a `httpOnly`, `SameSite=Lax` cookie.

## 9\. Data Flow

  - **Client ↔ Server: Server-Sent Events (SSE)** are the primary mechanism for delivering AI-generated content for analysis and action plans. Standard REST API calls (POST, GET) are used for initial data submission (questionnaire) and session management.
  - **Server-Side:** The internal data flow is orchestrated by streaming-specific chains in server/ai/chains/ which pipe AI output directly to the client response.
  - **State Management:** Client-side state for incoming streams is managed within individual React components using useState and useEffect. TanStack Query is used for non-streaming server state. Data is persisted in sessionStorage on stream completion to handle page refreshes gracefully.

## 10\. Environment Variables

The application will require the following environment variables to be set. On Replit, these will be configured in **Secrets**. For local development, they will be in an `.env` file.

  - `DATABASE_URL`: The full connection string for the PostgreSQL database.
  - `GEMINI_API_KEY`: The API key for Google AI Studio.
  - `GEMINI_REASONING_MODEL`: The identifier for the main analysis model.
  - `GEMINI_FACTS_MODEL`: The identifier for the fact-retrieval model.
  - `YOUTUBE_API_KEY`: A valid API key from the Google Cloud Console with the YouTube Data API v3 enabled.