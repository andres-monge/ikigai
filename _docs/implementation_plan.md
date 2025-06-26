
## Project Setup & Configuration

- [ ] Step 1: Synchronize Environment Variables

    - **Task**: Update the `.env.example` file to include all necessary environment variables for the project, specifically for the Gemini API. This ensures that any developer can get started quickly.
    - **Files**:
        - `.env.example`: Add `GEMINI_API_KEY=""` and `GEMINI_MODEL="models/gemini-1.5-flash-preview-0514"`. Add comments explaining what each variable is for.
    - **Step Dependencies**: None
    - **User Instructions**: After this step, create a copy of this file named `.env.local` and fill in your actual `GEMINI_API_KEY`. This file is git-ignored and should not be committed.
- [ ] Step 2: Add Testing and Typechecking Scripts

    - **Task**: Add `test` and `typecheck` scripts to the `package.json` file to standardize quality checks.
    - **Files**:
        - `package.json`: In the `scripts` section, add `"test": "vitest"` and `"typecheck": "tsc --noEmit"`.
    - **Step Dependencies**: None
    - **User Instructions**: You will install the testing libraries in a later step.

---

## Database & Storage Layer

- [ ] Step 3: Extend Drizzle and Zod Schemas

    - **Task**: Overhaul the `shared/schema.ts` file to match the detailed, multi-table database schema from the technical specification. This is a foundational step that defines the application's data structures.
    - **Files**:
        - `shared/schema.ts`:
            - Replace the existing `assessmentSessions` and `chatMessages` tables with the new, detailed versions from the technical specification.
            - Add the new `purpose_paths`, `salary_data` tables.
            - Define and export all related Zod schemas for API validation (`ActionState`, etc.) and Drizzle types (`$inferSelect`, `$inferInsert`).
    - **Step Dependencies**: Step 1
    - **User Instructions**: If using a live Postgres database (like Neon), run `npm run db:push` after this step to sync the schema.
- [ ] Step 4: Refactor Server Routes into Feature-Based Files

    - **Task**: Reorganize the backend routes from a single file into a more maintainable, feature-based structure as specified.
    - **Files**:
        - `server/routes/assessment.ts`: Create this new file and move all logic related to the `/api/analyze` and (future) `/api/action-plan` endpoints here.
        - `server/routes/chat.ts`: Create this new file and move all logic for the `/api/chat` endpoint here.
        - `server/routes.ts`: This file should now be removed or repurposed to simply import and register the routers from `assessment.ts` and `chat.ts` with the main Express app.
        - `server/index.ts`: Update the `registerRoutes` import and call to reflect the new structure.
    - **Step Dependencies**: Step 3
- [ ] Step 5: Create Centralized Gemini Wrapper

    - **Task**: Create a dedicated module for all Gemini API interactions. This wrapper will handle API calls, retries with exponential backoff, and centralized error handling, making the route handlers cleaner and more robust.
    - **Files**:
        - `server/grounding.ts`: Create this new file. Implement a `generateWithRetry` function that takes a prompt and options. This function should contain the `fetch` call to the Gemini API, implement a retry mechanism for failed requests, and parse the JSON response. Add helper functions for generating the specific prompts for analysis, action plans, and chat.
    - **Step Dependencies**: Step 4
- [ ] Step 6: Update In-Memory Storage

    - **Task**: Update the `server/storage.ts` module to support the new database schema, implementing the specific methods required by the newly refactored route handlers and AI wrapper.
    - **Files**:
        - `server/storage.ts`:
            - Update the `IStorage` interface to include new methods for CRUD operations on `purpose_paths`, `salary_data`, and the updated `assessment_sessions` and `chat_messages`.
            - In the `MemStorage` class, add new `Map` objects to hold the data for these new "tables" and implement the corresponding interface methods defined in the previous step.
    - **Step Dependencies**: Step 5

---

## API and AI Logic Implementation

- [ ] Step 7: Create AI Wrapper and In-Memory Cache

    - **Task**: Create the foundational modules for the new AI strategy. This includes a low-level Gemini API client wrapper and a simple in-memory cache for salary data. This replaces the old `grounding.ts` with a more specialized structure.
    - **Files**:
        - `server/ai/wrapper.ts`: Create this new file. Implement a low-level client with functions to call the Gemini API. Include separate helpers for making a standard `generateContent` call and one that enables the `tool_code` (search). This module handles authentication and basic request/response formatting.
        - `server/cache.ts`: Create this new file. Implement a simple in-memory cache class with `get`, `set`, and `has` methods. It should handle a Time-to-Live (TTL) of 24 hours for salary data.
        - `server/ai/chains.ts`: Create this file as a placeholder for the next step.
    - **Step Dependencies**: Steps 1-6 (completed).
    - **User Instructions**: Ensure the new models (`models/gemini-2.5-flash-lite-preview-06-17` and `models/gemini-2.5-flash`) are enabled for your API key in the Google AI Studio. Update Replit Secrets or `.env.example` and `.env.local` to include separate variables if needed, e.g., `GEMINI_FACTS_MODEL` and `GEMINI_REASONING_MODEL`.
- [ ] Step 8: Implement the Two-Call Orchestration Chain

    - **Task**: Implement the high-level orchestration logic in `chains.ts`. This function, `getPurposeDiscoveryChain`, will manage the parallel execution of the two AI calls, handle the salary cache, and pass the data from the "Facts" call to the "Reasoning" call via function calling.
    - **Files**:
        - `server/ai/chains.ts`: Implement the `getPurposeDiscoveryChain` function.
            1. It should accept the user's questionnaire responses.
            2. It will define a `getSalaryDataForCareers` tool schema for the Reasoning model.
            3. It will start **Call 2** (GEMINI_REASONING_MODEL) with the user data and the tool definition.
            4. When the model calls the tool, this function will check the `cache.ts` module.
            5. For any cache misses, it will trigger **Call 1** (GEMINI_FACTS_MODEL) using the search tool to get the missing salary data.
            6. It will populate the cache with the new data.
            7. Finally, it will return the salary data to Call 2, which will then generate the final, structured JSON.
            8. Add Zod validation for the final output, with a single retry if validation fails.
    - **Step Dependencies**: Step 7.
- [ ] Step 9: Re-implement `/api/analyze` Endpoint

    - **Task**: Refactor the `/api/analyze` endpoint to be a simple orchestrator. Its sole responsibility is to call the new `getPurposeDiscoveryChain` and send the result to the client.
    - **Files**:
        - `server/routes/assessment.ts`: Simplify the `POST /api/analyze` handler. Remove all direct AI logic. It should now import and call `getPurposeDiscoveryChain`, passing the request body. Once the chain resolves, it should save the results to storage and return the JSON to the client.
    - **Step Dependencies**: Step 8.
- [ ] Step 10: Implement Action Plan with Two-Call Chain

    - **Task**: Implement the `getActionPlanChain` using the same two-call strategy and update the `/api/action-plan` endpoint to use it.
    - **Files**:
        - `server/ai/chains.ts`: Add a new `getActionPlanChain` function. This chain will use Call 1 (Facts/Search) to find relevant YouTube course URLs and Call 2 (Reasoning/JSON) to structure the detailed action plan, consuming the URLs via a function call.
        - `server/routes/assessment.ts`: Update the `POST /api/action-plan` handler to call `getActionPlanChain`.
    - **Step Dependencies**: Step 9.
- [ ] Step 10.1: Refine System Prompts 

    - **Task**: Follow the strategies outlined in the prompting_strategies section to refine the code and system prompts in `server/ai/chains.ts` to include Paul Graham's reasoning and personality from specific essays. I want to emphasize that AI persona Nami's personality and writing will mimic that of Paul Graham. It will use the principles outlined in these Paul Graham essays to decide which Purpose Paths it should present to the user. It will also use the essays to encourage and explain the why behind every suggestion made to the user in all interactions. Essays:

      - What to Do
      - How to Do What You Love
      - When To Do What You Love
      - How to Do Great Work
      - What You'll Wish You'd Known
      - How to Be an Expert in a Changing World
    - **Files**:
        - `server/ai/chains.ts`
    - **Step Dependencies**: Step 10.
- [ ] Step 10.2: Refactor Questionnaire Component and Data Structure

    - **Task**: Overhaul `questionnaire.tsx` to use the new, simplified questions and to submit a data structure containing both the question text and the user's answer. This makes the component the single source of truth for the questions.
    - **Files**:
        - `client/src/pages/questionnaire.tsx`:
            - Replace the existing multi-field form state with a single state object that holds answers indexed by a question identifier.
            - Define the new questions as a constant array of objects within the component file. Each object will contain an `id`, `category`, and the `question` text.
            - The component will render the form by mapping over this constant array.
            - The `handleSubmit` function will be modified to construct a payload that combines the question text from the constant with the answer from the state, creating a structured array of `{ question: string, answer: string }` for each category.
    - **Step Dependencies**: Step 10.1.
    - **Success Criteria**: The form renders the new questions correctly and, upon submission, calls the `/api/analyze` endpoint with the new, richer data structure.
- [ ] Step 10.3: Update Shared Zod Schemas and Client-Side Types

    - **Task**: Align the shared data schemas and types with the new question-and-answer data structure being sent from the client. This ensures type safety and validation across the entire stack.
    - **Files**:
        - `shared/schema.ts`:
            - Redefine the `questionnaireResponsesSchema` Zod schema. Instead of a nested object of strings, it will now be an object where each key (e.g., `passions`, `skills`) holds an array of objects, each conforming to `z.object({ question: z.string(), answer: z.string() })`.
            - All inferred types like `QuestionnaireResponses` will be automatically updated by this change.
        - `client/src/types/assessment.ts`:
            - Verify that this file correctly re-exports the `QuestionnaireResponses` type from `shared/schema.ts`. No direct changes should be needed if it's already set up for inference, but it must be checked.
    - **Step Dependencies**: Step 10.2.
    - **Success Criteria**: The backend can successfully validate the new payload from the client using the updated Zod schema. The TypeScript compiler shows no errors related to the `QuestionnaireResponses` type.
- [ ] Step 10.4: Adapt AI Chain Prompts to Consume New Data Structure

    - **Task**: Update the system prompts in the AI orchestration layer to correctly parse and utilize the new, more contextual questionnaire data.
    - **Files**:
        - `server/ai/chains.ts`:
            - Modify the `_getPurposeDiscoverySystemPrompt` function.
            - Instead of simply `JSON.stringify(responses)`, the prompt generation logic will now map over the new arrays (e.g., `responses.passions`) and format the user's data in a much more readable way for the AI, like:

                ```
                ---
                Question: What specific activities make you forget to check the clock...?
                Answer: Coding, because...
                ---
                ```

            - This ensures the AI receives the full context for every single answer provided by the user.
    - **Step Dependencies**: Step 10.3.
    - **Success Criteria**: The system prompts sent to the Gemini API are correctly formatted with the full question-and-answer pairs, providing maximum context for the AI's reasoning process.
- [ ] Step 11: Implement Synchronous Chat Refinement

    - **Task**: Refactor the `/api/chat` endpoint to use the new `server/ai/wrapper.ts`, but keep it **synchronous** for now. This step aligns the chat endpoint with the new backend structure without adding the complexity of streaming yet.
    - **Files**:
        - `server/routes/chat.ts`:
            - Modify the `POST /api/chat` handler. Replace the direct `fetch` call with a **non-streaming** call to a new chat-specific function in `server/ai/wrapper.ts`.
            - The handler will wait for the full response from the AI and send it back as a complete JSON object. The `context` logic for loading different prompts remains.
    - **Step Dependencies**: Step 10.4.
    - **Success Criteria**: The chat functionality works as before, but the backend implementation is now consistent with the new AI wrapper architecture.
- [ ] Step 12: Introduce Streaming (SSE) to the Chat Endpoint

    - **Task**: Upgrade the now-refactored chat endpoint to support real-time streaming using Server-Sent Events (SSE). This isolates the work of adding streaming from any other feature logic.
    - **Files**:
        - `server/routes/chat.ts`:
            - Modify the `POST /api/chat` handler to set the necessary SSE headers (`Content-Type: text/event-stream`, etc.).
            - Change the call to the AI wrapper to be a **streaming** call.
            - As data chunks are received from the AI, write them to the response stream in the `data: ...\n\n` SSE format.
    - **Step Dependencies**: Step 11.
    - **Success Criteria**: When this endpoint is called with a tool like Postman or `curl`, it holds the connection open and streams back text chunks instead of returning a single JSON payload.

---

## Code Cleanup & Simplification

- [ ] Step 13: Remove Obsolete Client-Side AI Logic

    - **Task**: The file `client/src/lib/gemini.ts` contains outdated system prompts and helper functions that have been superseded by the more advanced, secure, and robust server-side implementation in `server/ai/`. This file is no longer used and its presence creates confusion. This step removes the file and any lingering imports to eliminate dead code.

    - **Files**:

        - `client/src/lib/gemini.ts`: Delete this file entirely.

    - **Step Dependencies**: None. This is a standalone cleanup task.

    - **User Instructions**: After this step, verify that the client application still builds and runs correctly by running `npm run dev`.


---

## Backend AI Module Refactoring

- [ ] Step 14: Extract AI-Related Schemas

    - **Task**: Move all Zod validation schemas and OpenAPI schemas from `server/ai/chains.ts` into a new, dedicated file. This isolates the data structure definitions from the orchestration logic.

    - **Files**:

        - `server/ai/schemas.ts`: Create this new file. Cut all Zod schema definitions (`salaryFunctionArgSchema`, `purposeDiscoveryResultSchema`, etc.) and OpenAPI schema objects (`purposeDiscoveryOpenApiSchema`, `actionPlanOpenApiSchema`) from `chains.ts` and paste them here. Export all schemas.

        - `server/ai/chains.ts`: Remove the schema definitions that were moved and import them from the new `server/ai/schemas.ts` file.

    - **Step Dependencies**: Step 13.

- [ ] Step 15: Isolate System Prompt Generation

    - **Task**: Move the large, complex system prompt generation functions into their own module. This separates the creative "prompt engineering" work from the logical flow of the AI chains.

    - **Files**:

        - `server/ai/prompts.ts`: Create this new file. Move the `_getPurposeDiscoverySystemPrompt`, `_getActionPlanSystemPrompt`, `_getChatRefinementSystemPrompt`, and `_formatQuestionnaireForPrompt` helper functions from `chains.ts` into this file. Export the main prompt functions.

        - `server/ai/chains.ts`: Remove the moved functions and import them from `server/ai/prompts.ts`. You will also need to import `QuestionnaireResponses`, `Language`, and `PurposePath` types into `prompts.ts`.

    - **Step Dependencies**: Step 14.

- [ ] Step 16: Separate AI Tool Definitions

    - **Task**: Move the Gemini Function Calling tool definitions into a dedicated file. This makes it easier to manage the tools the AI can use.

    - **Files**:

        - `server/ai/tools.ts`: Create this new file. Move the `getSalaryDataTool` and `getYoutubeVideosForSkillsTool` constant definitions from `chains.ts` into this file and export them.

        - `server/ai/chains.ts`: Remove the tool definitions and import them from `server/ai/tools.ts`.

    - **Step Dependencies**: Step 15.

- [ ] Step 17: Decouple Gemini API Types

    - **Task**: Clean up the `server/ai/wrapper.ts` file by moving all Gemini REST API type definitions into their own file. This leaves the wrapper focused solely on the logic of making API calls.

    - **Files**:

        - `server/ai/types.ts`: Create this new file. Move all `export interface Gemini...` type definitions from the top of `wrapper.ts` into this file and export them.

        - `server/ai/wrapper.ts`: Remove the moved type definitions and import them from `server/ai/types.ts`. Also, update `server/ai/chains.ts` to import `GeminiContent` from the new types file.

    - **Step Dependencies**: Step 16.


---

## Frontend Architecture Refactoring

- [ ] Step 18: Refactor Client-Side Routing

    - **Task**: Convert the main application flow from a local state machine to a proper URL-based Single-Page Application using `wouter`. This is a foundational change for the frontend that also decouples state from the main `App.tsx` component. This step replaces the original Step 13.

    - **Files**:

        - `client/src/App.tsx`: Remove the `currentState`, `results`, and `isLoading` state management. Replace conditional rendering with a `<Switch>` and `<Route>` structure from `wouter`. Define routes for `/`, `/questionnaire`, `/results`, and `/action-plan`.

        - `client/src/pages/questionnaire.tsx`: Add the `analyzeResponsesMutation` logic here. On success, use `useLocation` from `wouter` to navigate to the `/results` page. Manage loading state via the mutation's `isPending` property.

        - `client/src/pages/results.tsx`: Use `useSessionStorage` to retrieve the `results` data directly.

        - `client/src/pages/action-plan.tsx`: Create this new, initially empty, page component.

        - `client/src/pages/home.tsx`: Ensure the "Start" button uses `useLocation` to navigate to `/questionnaire`.

    - **Step Dependencies**: Step 17.

    - **User Instructions**: After this step, the application will use URLs for navigation (e.g., `/questionnaire`).

- [ ] Step 19: Create Frontend Query Hooks

    - **Task**: Abstract the analysis mutation logic from the `Questionnaire` page into a reusable `useCreateAssessment` hook to clean up the page component and improve separation of concerns. This completes the work for the original Step 14.

    - **Files**:

        - `client/src/hooks/use-assessment.ts`: Create this new file. Add a `useCreateAssessment` hook that contains the `useMutation` logic for posting to `/api/analyze`. It should return the `mutate` function and the `isPending` status.

        - `client/src/pages/questionnaire.tsx`: Remove the inline `useMutation` logic and replace it with a call to the new `useCreateAssessment` hook.

    - **Step Dependencies**: Step 18.


---

## Type Safety & Data Integrity

- [ ] Step 20: Introduce Hydrated Storage Types

    - **Task**: Eliminate `any` casts in the backend by creating specific TypeScript types for "hydrated" data models (i.e., objects with their relations joined), improving type safety and autocompletion.

    - **Files**:

        - `server/storage.ts`:

            - Define and export a new type `HydratedAssessmentSession` which extends `AssessmentSession` and explicitly includes `purposePaths: (PurposePath & { salaryData: SalaryData[] })[]`.

            - Update the `hydrateSession` private method to return a `Promise<HydratedAssessmentSession>`.

            - Update the `getAssessmentSessionById` and `getAssessmentSessionBySessionId` methods in both the `IStorage` interface and `MemStorage` class to return `Promise<HydratedAssessmentSession | undefined>`.

        - `server/routes/assessment.ts`:

            - Import the new `HydratedAssessmentSession` type.

            - Remove the `any` cast when accessing `session.purposePaths` by ensuring the `session` variable is correctly typed as `HydratedAssessmentSession`.

    - **Step Dependencies**: Step 19.


---

## Action Plan Feature Implementation

- [ ] Step 21: Implement "Choose Path" Flow

    - **Task**: Wire up the UI to allow a user to select a purpose path, which triggers action plan generation and navigates them to the new page.

    - **Files**:

        - `client/src/components/results/purpose-paths.tsx`: Add a "Choose this Path & Get Plan" `Button` to each path card that calls a handler passed via props.

        - `client/src/pages/results.tsx`: Pass the handler to `PurposePaths`. This handler will call the `useCreateActionPlan` mutation (from `hooks/use-assessment.ts`) and, on success, navigate the user to the `/action-plan` route.

        - `client/src/hooks/use-assessment.ts`: Add a `useCreateActionPlan` mutation hook that posts to `/api/action-plan`.

    - **Step Dependencies**: Step 20.

- [ ] Step 22: Build the Action Plan Page

    - **Task**: Develop the `action-plan.tsx` page to display the detailed plan fetched from the server.

    - **Files**:

        - `client/src/pages/action-plan.tsx`: Use a `useGetActionPlan` query hook to fetch the session data. Display the plan using Shadcn components like `Accordion` for skills and `Card` for project ideas and YouTube links. Add buttons for "Export to PDF" and "Refine with Nami".

        - `client/src/hooks/use-assessment.ts`: Add a `useGetActionPlan` query hook that fetches the session data.

    - **Step Dependencies**: Step 21.

- [ ] Step 23: Consume the SSE Stream in the Chat Interface

    - **Task**: Upgrade the `ChatInterface` component to handle the streaming response from the backend, providing a real-time "typing" effect.

    - **Files**:

        - `client/src/components/chat-interface.tsx`:

            - Replace the existing synchronous `fetch` logic.

            - Use the native `EventSource` browser API to connect to the `/api/chat` endpoint.

            - Add an event listener for `message` events. When a new chunk of data arrives, append it to the last message in the chat history state. Look for the `data: [DONE]` signal to close the connection.

            - Handle `error` and `open` events for a robust connection.

    - **Step Dependencies**: Step 22.

- [ ] Step 24: Implement PDF Export for Action Plan

    - **Task**: Add the functionality to export the detailed action plan to a PDF document.

    - **Files**:

        - `client/src/lib/pdf-export.ts`: Add a new function `exportActionPlanToPDF(plan)` that uses `jspdf` to generate a well-formatted document from the action plan data.

        - `client/src/pages/action-plan.tsx`: Wire the "Export to PDF" button to call the new function.

    - **Step Dependencies**: Step 22.


---

## Finishing Touches & Testing

- [ ] Step 25: Add Internationalization (i18n) Keys

    - **Task**: Add all new user-facing strings for both English and Spanish to the i18n module for the Action Plan feature.

    - **Files**:

        - `client/src/lib/i18n.ts`: Add translations for the action plan page title, button labels, section headers, and any other new UI text.

    - **Step Dependencies**: Step 22.

- [ ] Step 26: Configure Vitest and Add Sample Tests

    - **Task**: Set up the testing framework and write initial tests for a critical backend module and a frontend component.

    - **Files**:

        - `vitest.config.ts`: Create or verify this configuration file.

        - `server/ai/__tests__/chains.test.ts`: Create this test. Write a unit test for `getPurposeDiscoveryChain`, mocking the AI wrapper and cache modules to verify the orchestration logic.

        - `client/src/components/__tests__/header.test.tsx`: Create or verify a basic test for the Header component.

    - **Step Dependencies**: All previous steps.

    - **User Instructions**: Run `npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom` if not already installed.

- [ ] Step 27: Update Documentation and Add Analytics Stub

    - **Task**: Finalize the project by updating the README and adding a placeholder for future analytics integration.

    - **Files**:

        - `README.md`: Add sections explaining the new AI strategy, folder structure, and environment variables.

        - `client/src/lib/analytics.ts`: Create this file with stub functions (e.g., `trackEvent`).

        - `client/src/App.tsx`: Import `trackEvent` and call it at a key point, like when the `/results` page is loaded.

    - **Step Dependencies**: Step 26.