# Implementation Plan

## Feature Removal
- [x] Step 1.1: Remove Backend Chat Logic
  - **Task**: To align with the decision to remove the chat refinement feature, this step involves deleting all backend code related to chat. This includes the AI chain for generating chat responses, the API endpoints, and any associated prompts, schemas, and type definitions. This will simplify the backend and remove unused code.
  - **Suggested Files for Context**:
    - `server/routes/chat.ts`
    - `server/ai/chains/chat-refinement.chain.ts`
    - `server/routes.ts`
    - `server/ai/chains/index.ts`
    - `server/ai/prompts.ts`
    - `server/ai/schemas.ts`
    - `shared/schema.ts`
  - **Step Dependencies**: None
  - **User Instructions**: None

- [ ] Step 1.2: Remove Frontend Chat UI and State
  - **Task**: With the backend support removed, this step focuses on removing all client-side chat functionality. This includes deleting the `ChatInterface` component, removing the "Ask Follow-Up" buttons from the Results and Action Plan pages, and cleaning up any related state management in the `App.tsx` component and i18n files.
  - **Suggested Files for Context**:
    - `client/src/components/chat-interface.tsx`
    - `client/src/App.tsx`
    - `client/src/pages/results.tsx`
    - `client/src/pages/action-plan.tsx`
    - `client/src/lib/i18n.ts`
  - **Step Dependencies**: Step 1.1
  - **User Instructions**: None

## Code Organization & Structure
- [x] Step 2.1: Abstract YouTube API Logic into a Service ✅ **COMPLETED 2025-08-17**
  - **Task**: The logic for fetching data from the YouTube Data API is currently embedded within the `action-plan.chain.ts` file. To improve separation of concerns, this logic should be extracted into its own dedicated service file. The AI chain will then call this service, making the chain purely an orchestrator of business logic rather than an implementer of external API calls.
  - **Suggested Files for Context**:
    - `server/ai/chains/action-plan.chain.ts`
  - **Step Dependencies**: None
  - **User Instructions**: A new file will be created at `server/services/youtube.ts` to house the abstracted logic.
  - **Implementation Notes**: 
    - Created `server/services/youtube.ts` with `getYoutubeVideosForSkills()` public API
    - Maintained all existing functionality: caching, error handling, validation
    - Updated error logging with `[YouTubeService]` prefix for better debugging
    - Removed 90+ lines of YouTube logic from action-plan chain
    - Action plan chain now imports and uses the service cleanly

- [ ] Step 2.2: Abstract Salary Fetching Logic into a Service
  - **Task**: Similar to the YouTube logic, the salary fetching and parsing code is currently inside the `purpose-discovery.chain.ts`. This step will move that functionality into a new, separate service file to better organize the code and delineate responsibilities.
  - **Suggested Files for Context**:
    - `server/ai/chains/purpose-discovery.chain.ts`
  - **Step Dependencies**: None
  - **User Instructions**: A new file will be created at `server/services/salary.ts` for the abstracted logic.

## Code Quality & Best Practices
- [ ] Step 3.1: Harden Action Plan Route Logic
  - **Task**: The `/api/action-plan` endpoint currently contains fallback logic to treat the `chosenPathId` as an array index if the path isn't found by its ID. This is brittle and can hide client-side bugs. This task is to remove this fallback and enforce that the client must always provide the correct database ID for the chosen path, making the API more robust and predictable.
  - **Suggested Files for Context**:
    - `server/routes/assessment.ts`
  - **Step Dependencies**: None
  - **User Instructions**: None.
