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
      - **AI & Data:** Uses **Vercel AI SDK** with **`GEMINI_REASONING_MODEL`** for structured object streaming via `streamObject`. Real-time video data is sourced from the YouTube Data API. The dual-model strategy is simplified to focus on reliable structured data generation.
      - **Data Persistence:** Session data is stored in a **Replit PostgreSQL database**. Schema management and migrations are handled by **Drizzle ORM** and **Drizzle Kit**. A two-database strategy (production and development) is employed to ensure a safe workflow.
      - **Deployment:** The application is packaged for deployment on Replit.

<!-- end list -->

```mermaid
graph TD
    subgraph "Browser (Client)"
        C1[React SPA w/ useObject] -->|HTTPS SSE| S1(Express Server)
    end

    subgraph "Replit Environment (Server)"
        S1 -- "/api/analyze/stream" --> ORC(AI SDK streamObject)

        subgraph "AI Stream (Purpose Discovery)"
            ORC -- "User Profile + Zod Schema" --> CALL2(Gemini 1.5 Pro streamObject)
            CALL2 -- "Structured JSON Stream" --> PARSE1(AI SDK Parser)
        end

        S1 -- "/api/action-plan/stream" --> ORC2(AI SDK streamObject)
        subgraph "AI Stream (Action Plan)"
            ORC2 -- "Chosen Path + Zod Schema" --> CALL3(Gemini 1.5 Pro streamObject)
            CALL3 -- "Structured JSON Stream" --> PARSE2(AI SDK Parser)
            PARSE2 -- "Post-process: getYoutubeVideos" --> YT_API(YouTube Data API)
        end

        subgraph "Data Persistence"
            DB[(Replit PostgreSQL)]
        end

        PARSE1 -- "Validated Object" --> PERSIST1(Validate & Persist)
        YT_API -- "Enriched Object" --> PERSIST2(Validate & Persist)
        PERSIST1 --> DB
        PERSIST2 --> DB
    end

    style ORC fill:#d5e8d4,stroke:#333
    style ORC2 fill:#d5e8d4,stroke:#333
    style CALL2 fill:#f8cecc,stroke:#333
    style CALL3 fill:#f8cecc,stroke:#333
    style PARSE1 fill:#e1f5fe,stroke:#333
    style PARSE2 fill:#e1f5fe,stroke:#333
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
│ │ │ ├── action-plan.chain.ts
│ │ │ ├── action-plan.stream.chain.ts # Logic for streaming action plan
│ │ │ ├── index.ts
│ │ │ ├── purpose-discovery.chain.ts
│ │ │ └── purpose-discovery.stream.chain.ts # Logic for streaming results
│ │ ├── limiter.ts # Concurrency control for AI requests
│ │ ├── prompts.ts # Manages system prompt generation & persona
│ │ ├── schemas.ts # Zod schemas for AI SDK streamObject validation
│ │ ├── tools.ts # Function-calling tool definitions
│ │ ├── types.ts # TypeScript types for the Gemini API
│ │ └── wrapper.ts # Low-level Gemini API client wrapper
│ ├── db.ts # Drizzle client setup and export
│ ├── routes/ # Feature-based API route handlers
│ │ ├── assessment/ # Assessment-related endpoints (modular)
│ │ │ ├── action-plan.ts # Action plan generation endpoints
│ │ │ ├── assessment.stream.test.ts # Integration tests for streaming
│ │ │ ├── assessment.test.ts # Unit tests for assessment routes
│ │ │ ├── index.ts # Barrel export combining all assessment routes
│ │ │ ├── purpose-discovery.ts # Purpose discovery endpoints
│ │ │ └── utils.ts # Shared utilities for assessment routes
│ │ └── session.ts # Session management endpoints
│ ├── services/ # External API service abstractions
│ │ ├── index.ts # Service exports
│ │ ├── salary.ts # Salary data fetching service
│ │ └── youtube.ts # YouTube API service
│ ├── utils/ # Server utilities
│ │ └── sse.ts # Server-Sent Events utilities
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
    3.  **AI Analysis (`GEMINI_REASONING_MODEL`):** The reasoning model analyzes the user's questionnaire and generates structured career path recommendations using the Vercel AI SDK's `streamObject` functionality.
    7.  The final, structured JSON (without a top-level `salaryData` key) is returned, validated via Zod, and persisted to the PostgreSQL database.
    
### 3.1.1 Purpose Discovery (Streaming)

  - **User Story:** As a user, I want to submit my questionnaire and instantly see my results page appear, with the analysis filling in live on the screen.

  - **Implementation Steps (Streaming):**

    1.  Navigation & Connection: The client submits the questionnaire via a standard POST to /api/questionnaire/save, which saves the responses and returns success. The client then immediately navigates to /results. The Results page component mounts, displays a skeleton UI, and uses the Vercel AI SDK's `useObject` hook to connect to GET /api/analyze/stream.
    2.  Backend Generation: The server receives the request and invokes `streamObject` from the AI SDK with a Zod schema defining the expected structure. The prompt instructs the AI to generate the analysis as structured JSON matching the schema.
    3.  Streaming: The AI SDK handles the structured streaming protocol, sending partial objects as Server-Sent Events (SSE) that are automatically parsed and validated.
    4.  Progressive Rendering: The `useObject` hook provides partial data as it arrives. React components render skeleton states until their corresponding data fields become available, then progressively fill with the streamed content.
    5.  Persistence: When the stream completes, the server validates the final structured object against the Zod schema and persists it to the database. The client receives the complete object for sessionStorage to handle page refreshes without re-streaming.
    
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

    1.  Navigation & Connection: When the user clicks "Get Action Plan," the client immediately navigates to /action-plan?pathId=X. The ActionPlan page component mounts, shows a skeleton UI, and uses the Vercel AI SDK's `useObject` hook to connect to GET /api/action-plan/stream.
    2.  Backend Generation: The server invokes `streamObject` with a Zod schema for the action plan structure. The AI generates the plan as structured JSON, with YouTube video enrichment happening as post-processing after the main content streams.
    3. Streaming & Rendering: The AI SDK streams partial action plan objects. The `useObject` hook provides milestone data as it becomes available, allowing React components to progressively render each milestone with its timeline and actions.
    4. Persistence: Upon stream completion, YouTube videos are fetched and integrated into the plan, then the complete validated object is saved to the database. The client receives the enriched plan for sessionStorage.

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
      - `ikigai_alignment`: **`jsonb`** (The `pay` property within this object contains the full narrative text about salary information, including source URLs).
      - `action_strategy`: `text`

-----

## **5. Server Actions & AI Strategy**

### **5.1 AI Implementation Strategy**

The strategy is updated to leverage the best model for each task while simplifying the final output.

#### **Simplified AI Strategy with Vercel AI SDK**

| Component | Purpose | Model | Implementation |
| :--- | :--- | :--- | :--- |
| **Purpose Discovery** | • Generate structured career analysis with core drivers and three purpose paths \<br\>• Include salary information narratively embedded | **`GEMINI_REASONING_MODEL`** | Single `streamObject` call with Zod schema validation. Simplified prompt focuses on JSON structure matching UI expectations. |
| **Action Plan** | • Generate detailed milestone-based action plan \<br\>• Structure ready for YouTube video enrichment | **`GEMINI_REASONING_MODEL`** | Single `streamObject` call followed by post-processing to add YouTube videos. Maintains coherent narrative. |

#### **Strategy Benefits**

  - **Reliability:** AI SDK handles parsing and validation automatically, eliminating custom delimiter issues.
  - **Type Safety:** Zod schemas ensure consistent data structure between frontend and backend.
  - **Simplified Architecture:** Single model calls reduce complexity while maintaining quality.
  - **YouTube Data API Integration:** Post-processing approach provides valid links and rich metadata without complicating the streaming.

### 5.3 AI SDK Integration (`server/ai/`)

  - **Description:** Simplified AI integration using Vercel AI SDK for reliable structured streaming.
  - `schemas.ts`: Zod schemas that define the expected structure for purpose discovery and action plan objects.
  - Streaming endpoints use `streamObject` directly in route handlers, eliminating the need for complex chain orchestration.
  - Post-processing (like YouTube video enrichment) happens after the main content streams, keeping the architecture simple.

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

  - **Client ↔ Server: Vercel AI SDK Protocol** powers the streaming interface using Server-Sent Events (SSE) with automatic parsing and validation. Standard REST API calls (POST, GET) are used for initial data submission (questionnaire) and session management.
  - **Server-Side:** Route handlers use `streamObject` directly with Zod schemas for validation. The AI SDK handles the streaming protocol automatically, eliminating the need for custom parsers or delimiter handling. SSE utilities in server/utils/sse.ts support legacy endpoints during migration.
  - **State Management:** Client-side streaming is managed by the AI SDK's `useObject` hook, which provides partial data as it arrives. TanStack Query is used for non-streaming server state. Data is persisted in sessionStorage on stream completion to handle page refreshes gracefully.

## 10\. Environment Variables

The application will require the following environment variables to be set. On Replit, these will be configured in **Secrets**. For local development, they will be in an `.env` file.

  - `DATABASE_URL`: The full connection string for the PostgreSQL database.
  - `GEMINI_API_KEY`: The API key for Google AI Studio.
  - `GEMINI_REASONING_MODEL`: The identifier for the main analysis model.
  - `YOUTUBE_API_KEY`: A valid API key from the Google Cloud Console with the YouTube Data API v3 enabled.