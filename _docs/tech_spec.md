# Purpose Finder Technical Specification

## 1. System Overview

- **Core Purpose and Value Proposition:** An AI-powered web application to help users find their _ikigai_. It provides three actionable career paths based on a user's profile, and upon selection of a path, generates a detailed, step-by-step action plan. The entire experience is bilingual (English/Spanish).

- **Key Workflows:**

    1. **Assessment & Discovery:** The user completes a questionnaire. The system initiates a two-call AI process: a fast, lightweight call (`Flash-Lite`) retrieves real-time salary data, while a parallel, more powerful call (`Flash`) performs the core analysis, consuming the salary data via function calling to produce the final "Core Drivers" summary and three "Purpose Paths".
    2. **Salary Caching:** To optimize cost and latency, retrieved salary data is cached for 24 hours. Subsequent requests for the same career/location will use the cache, skipping the salary fact-finding call.
    3. **Discovery Refinement (Optional):** The user can chat with "Nami" to refine the three generated paths.
    4. **Path Selection & Action Plan:** The user selects their preferred path, triggering a new AI generation step (using the two-call strategy again) to create a detailed action plan with grounded YouTube links.
    5. **Action Plan Refinement (Optional):** The user can chat with "Nami" again to refine the detailed action plan.
    6. **Export:** The user can export their results or action plan to PDF.
- **System Architecture:**

    - **Frontend:** React SPA (Vite, TypeScript), using TanStack Query for server state. UI built with shadcn/ui and Tailwind CSS.
    - **Backend:** Node.js server (Express), orchestrating a parallel two-call AI strategy.
    - **AI & Data:** A dual-model strategy using `models/gemini-2.5-flash-lite-preview-06-17` for search-grounded fact retrieval and `models/gemini-2.5-flash` for JSON-structured reasoning.
    - **Data Persistence:** For the MVP, session data and salary caches are stored in-memory (`MemStorage`). The schema is designed for a seamless transition to PostgreSQL and Redis.
    - **Deployment:** The application is packaged for deployment on Replit.

Code snippet

```
graph TD
    subgraph "Browser (Client)"
        C1[React SPA] -->|HTTPS| S1(Express Server)
    end

    subgraph "Replit Environment (Server)"
        S1 -- "/api/analyze" --> ORC(Orchestrator)

        subgraph "AI Chain"
            ORC -- "User Profile" --> CALL2(② Flash Reasoning + JSON)
            ORC -- "Career Titles" --> CACHE{Salary Cache}
            CACHE -- "Cache Miss" --> CALL1(① Flash-Lite Facts + Search)
            CACHE -- "Cache Hit" --> FUNC_CALL(Salary Data)
            CALL1 --> CACHE
            FUNC_CALL -- "Function Call" --> CALL2
        end

        CALL2 --> PARSE(Validate & Persist)
        PARSE --> S1
    end

    style ORC fill:#d5e8d4,stroke:#333
    style CACHE fill:#dae8fc,stroke:#333
    style CALL1 fill:#fff0cc,stroke:#333
    style CALL2 fill:#f8cecc,stroke:#333
```

## 2. Project Structure

The project will be organized with a clear separation of concerns, adding more granularity to the server-side structure.

```
My_Directory_Structure/
├── client/                      # Frontend React SPA
├── scripts/                     # Database migration scripts
│   └── migrate.ts
├── server/                      # Backend Node.js/Express server
│   ├── routes/                  # Feature-based API route handlers
│   │   ├── assessment.ts        # Handles /analyze and /action-plan
│   │   └── chat.ts              # Handles /chat
│   ├── ai/                      # Modular AI logic directory
│   │   ├── chains.ts            # Orchestrates the multi-call AI sequences
│   │   ├── prompts.ts           # Manages system prompt generation & persona
│   │   ├── schemas.ts           # Zod/OpenAPI schemas for AI validation
│   │   ├── tools.ts             # Function-calling tool definitions
│   │   ├── types.ts             # TypeScript types for the Gemini API
│   │   └── wrapper.ts           # Low-level Gemini API client wrapper
│   ├── cache.ts                 # In-memory cache implementation for salaries
│   └── storage.ts               # In-memory session storage
├── shared/                      # Isomorphic code shared between client & server
│   └── schema.ts                # Drizzle/Zod schemas
└── .env.example                 # Environment variable definitions
```

## 3. Feature Specification

### 3.1 Purpose Discovery & Refinement

- **User Story:** As a user, I want to answer a questionnaire and receive three personalized career paths. I then want the ability to chat with an AI assistant to adjust these paths before making my final choice.
- **Implementation Steps (The Two-Call Chain):**
    1. The client sends a `POST` request to `/api/analyze`.
    2. The server's orchestrator in `server/ai/chains.ts` receives the request.
    3. It first checks the `server/cache.ts` for salary data for career titles relevant to the user's profile.
    4. **At the same time**, it initiates **Call 2** (`models/gemini-2.5-flash`) with forced JSON output. The prompt includes the user's full questionnaire and a `tool` definition for a function like `getSalaryDataForCareers(titles: string[])`. The model will begin its reasoning process but pause when it needs salary data.
    5. If the cache misses for any career title, the orchestrator triggers **Call 1** (`models/gemini-2.5-flash-lite`) with the search tool enabled to fetch only the missing salary data. The results are stored in the cache for 24 hours.
    6. Once all required salary data is available (from the cache or Call 1), the orchestrator resolves the `getSalaryDataForCareers` function call for Call 2, injecting the data.
    7. Call 2 resumes its execution and returns the final, structured JSON containing the `analysis`, `purposePaths`, and integrated `salaryData`.
    8. The server validates this JSON with Zod. If validation fails, it retries once.
    9. The final, validated data is persisted and sent to the client.

### 3.2 Action Plan Generation & Refinement

- **User Story:** As a user, after I've chosen my preferred career path, I want the system to generate a detailed, step-by-step action plan for me. I then want to be able to ask the AI for changes or clarifications to this plan.
- **Implementation Steps:**
    1. **Selection:** On the Results page, each of the three `PurposePath` cards will have a "Choose this Path & Get Plan" button. Clicking it calls `handleChoosePath(pathId)`.
    2. **Generation:**
        - This triggers a React Query mutation that sends a `POST` request to `/api/action-plan` with `{ sessionId, chosenPathId }`. A loading screen is shown.
        - The server receives the request and calls the Gemini Wrapper with a prompt focused on generating a detailed plan (milestones, skills, project ideas) for the _single_ chosen path. It will enable the search tool to find and cite YouTube course URLs.
        - The server saves the generated `actionPlan` object to storage and returns it.
        - The client navigates to a new `'actionPlan'` view, displaying the plan in a structured format (e.g., using Accordions).
    3. **Refinement:**
        - The Action Plan page will also have a "Refine with Nami" button.
        - This button opens the _same_ `ChatInterface` component, but with a different context: `<ChatInterface context="action_plan" ... />`.
        - The `POST` request to `/api/chat` will now include `{ context: 'action_plan' }`.
        - The server's chat handler sees this context and loads the _generated action plan_ into the Gemini prompt, allowing the user to have a focused conversation about refining it.

## 4. Database Schema

The normalized schema supports the distinct stages of the user journey.

### 4.1 Tables

- **`assessment_sessions`**: Stores the top-level session information.

    - `id`: `serial` (PK)
    - `session_id`: `text` (UNIQUE, NOT NULL)
    - `language`: `text` (NOT NULL, 'en' or 'es')
    - `responses`: `jsonb` (The initial questionnaire answers)
    - `core_drivers_analysis`: `jsonb`
    - `chosen_path_id`: `integer` (FK to `purpose_paths.id`, NULLABLE)
    - `action_plan`: `jsonb` (The detailed action plan)
    - `created_at`: `timestamptz` (DEFAULT `now()`)
    - `updated_at`: `timestamptz` (DEFAULT `now()`)
- **`purpose_paths`**: Stores the three (potentially refined) paths.

    - `id`: `serial` (PK)
    - `session_id`: `integer` (FK to `assessment_sessions.id` ON DELETE CASCADE)
    - `title`: `text` (NOT NULL)
    - `description`: `text`
    - `ikigai_alignment`: `jsonb`
    - `action_strategy`: `text` (High-level strategy)
- **`salary_data`**: Stores salary info linked to a specific path.

    - `id`: `serial` (PK)
    - `path_id`: `integer` (FK to `purpose_paths.id` ON DELETE CASCADE)
    - `entry_level`, `mid_level`, `senior_level`: `text`
    - `location`: `text`
    - `sources`: `text[]` (Array of strings)
    - `retrieved_at`: `timestamptz` (DEFAULT `now()`)
- **`chat_messages`**: Stores all chat history, regardless of context.

    - `id`: `serial` (PK)
    - `session_id`: `integer` (FK to `assessment_sessions.id` ON DELETE CASCADE)
    - `role`: `text` (NOT NULL)
    - `content`: `text` (NOT NULL)
    - `context`: `text` ('discovery' or 'action_plan')
    - `created_at`: `timestamptz` (DEFAULT `now()`)

## 5. Server Actions & AI Strategy

### 5.1 AI Implementation Strategy

The core of the application relies on a dual-model, two-call chain to achieve both real-time data grounding and reliable structured outputs.

#### Recommended Pairing for the Two-Call Split

| Call                            | Purpose                                                                                                                                                            | Model                              | Why this is the best fit                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Call 1 – “Facts”**            | • Use **Search tool** to fetch up-to-the-minute salary ranges + citation URLs for each career title.&lt;br>• Post-processing not required; free-form text is fine. | **`models/gemini-2.5-flash-lite`** | _Cost / throughput first._ Grounding already constrains hallucination, so we don’t need Flash’s extra “brain-power.” The latest Flash version offers an excellent balance of cost, high rate limits, and performance for this fact-retrieval task.                                                                                                                               |
| **Call 2 – “Reasoning + JSON”** | • Combine user questionnaire + salary facts.&lt;br>• Return strict JSON (`analysis`, `purposePaths`, `salaryData`).&lt;br>• No Search tool.                        | **`models/gemini-2.5-flash`**      | _Quality first._ Here we need deeper synthesis, nuanced language generation in two languages, and flawless adherence to your JSON schema. The Pro model is measurably stronger at complex reasoning and instruction-following than Flash, making it ideal for the main analysis. The lower rate limits are acceptable as this call is triggered only once per major user action. |


---

#### Operational Notes & Fall-backs

| Topic                  | Strategy                                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Latency**            | Parallelise: trigger Call 2 immediately. When it invokes the `getSalaryData` function, execute Call 1 (or retrieve from cache). This minimizes perceived latency. |
| **Cost Control**       | Cache salary facts per career title + locale for 24h in an in-memory store. A high cache-hit ratio dramatically reduces the number of calls to the "Facts" model. |
| **Quality Guardrails** | Validate Call 2's JSON output with Zod. If it fails validation, retry the call once. This handles transient model errors.                                         |


### 5.2 Gemini Wrapper (`server/ai/wrapper.ts`)

- **Description:** A low-level client for the Gemini API.
- **Functions:** Will include methods for `generateContent` and `generateContentWithTools`, handling authentication, request body formation, and basic error parsing.

### 5.3 Chain Orchestrator (`server/ai/chains.ts`)

- **Description:** Contains the high-level business logic for executing the multi-call sequences.
- **`getPurposeDiscoveryChain(userInput)`**: Implements the parallel execution, caching, and function-calling logic described in the Feature Specification.
- **`getActionPlanChain(chosenPath)`**: A similar chain for generating the detailed action plan.

## 6. Design System

(No changes from previous specification - remains robust)

## 7. Component Architecture

- **`ChatInterface.tsx` Component:**
    - This component is now fully reusable.
    - **Props:**

        TypeScript

        ```
        interface ChatInterfaceProps {
          isOpen: boolean;
          onClose: () => void;
          sessionId: string;
          language: Language;
          // New prop to determine the chat's purpose
          context: 'discovery' | 'action_plan';
        }
        ```

- **Error Handling:** Components will be wrapped in a React `<ErrorBoundary>` to gracefully handle rendering errors without crashing the application.

## 8. Authentication & Authorization

- **MVP Strategy:** No user accounts. Session is anonymous and identified by `sessionId`.
- **Session Token:** The `sessionId` will be stored in both `sessionStorage` for client-side access and a `httpOnly`, `SameSite=Lax` cookie.

## 9. Data Flow

- **Client ↔ Server:** REST API calls for primary actions. The complexity of the AI chain is fully abstracted behind a single API endpoint (e.g., `/api/analyze`).
- **Server-Side:** The internal data flow is now a parallel process orchestrated by `server/ai/chains.ts`, involving the cache and two distinct AI model calls.
- **State Management:** No changes. TanStack Query remains the source of truth for server data on the client, regardless of how that data was generated on the backend.