# Implementation Plan

## Phase 1: Critical Bug Fixes & Feature Updates

- [x] Step 1: Correct Session ID Propagation for Action Plan
    
    - **Task**: The "Choose this path" button fails because an empty `sessionId` is sent to the backend. This step ensures the correct `sessionId` is passed from the application's root to the `Results` page and used when generating the action plan.
        
    - **Files**:
        
        - `client/src/App.tsx`: Pass the `sessionId` state variable as a prop to the `Results` component within its `<Route>` definition.
            
        - `client/src/pages/results.tsx`: Update the `ResultsProps` interface to accept the `sessionId`. Pass this prop to the `useCreateActionPlan` hook, ensuring it's initialized with a valid ID.
            
    - **Step Dependencies**: None.
        
    - **User Instructions**: After the changes, running through the questionnaire and clicking "Choose this path & Get plan" should successfully navigate to the action plan page without a 404 error.
        
    - **✅ COMPLETED**: 
        - **Decision**: Propagated `sessionId` from top-level `App` component down to `Results` via props rather than relying on the persisted session object, guaranteeing a non-empty identifier for the `useCreateActionPlan` mutation.
        - **Files Updated**: `client/src/App.tsx` (passed `sessionId` to `<Results />` route), `client/src/pages/results.tsx` (added `sessionId` prop to `ResultsProps` and forwarded to `useCreateActionPlan`).
        - **Edge Cases Considered**: Brand-new visitors with no existing `sessionId` are covered because `App` auto-generates one on mount.
        - **Follow-up Bug**: Compilation currently fails due to `economic` vs `economicReality` mismatch; will be addressed in Step 2.
        
- [x] Step 2: Unify "Economic Reality" Data Key
    
    - **Task**: The "Economic Reality" field is blank due to a property name mismatch between the backend (`economicReality`) and frontend (`economic`). This step standardizes the property name to `economicReality` across the client-side codebase.
        
    - **Files**:
        
        - `client/src/types/assessment.ts`: In the `CoreDrivers` interface, rename the `economic` property to `economicReality`.
            
        - `client/src/components/results/core-drivers-summary.tsx`: Update the JSX to access `analysis.economicReality` instead of `analysis.economic`.
            
        - `client/src/lib/pdf-export.ts`: In the `exportToPDF` function, update the reference from `results.analysis.economic` to `results.analysis.economicReality`.
            
    - **Step Dependencies**: None.
        
    - **User Instructions**: The "Economic Reality" section in the "What's popping out of your answers" card should now correctly display the AI-generated text.
        
    - **✅ COMPLETED**:
        - **Decision**: Standardised `economicReality` property across the client-side codebase.
        - **Files Updated**:
            - `client/src/components/results/core-drivers-summary.tsx` – renamed `analysis.economic` → `analysis.economicReality` and added rich JSDoc.
            - `client/src/lib/pdf-export.ts` – updated PDF generation to reference `economicReality`, switched to new `FullAssessment` type, and added null-safety.
            - No backend changes required.
        - **Edge Cases Considered**: PDF export gracefully handles sessions where `coreDriversAnalysis` is null by falling back to empty strings.
        - **Follow-up**: Existing test failures are unrelated to this step and will be addressed in their respective future steps.
        
- [x] Step 3: Integrate Salary Data into Path Cards
    
    - **Task**: The separate "Salary Benchmarks" table will be removed. Salary information (range, location, and sources) will be displayed directly within each corresponding "Purpose Path" card. To keep file sizes manageable, the path card will be broken into smaller sub-components.
        
    - **Files**:
        
        - `client/src/pages/results.tsx`: Remove the `useMemo` hook for `salaryDataForTable` and delete the `<SalaryBenchmarks />` component invocation.
            
        - `client/src/components/results/purpose-paths/_components/salary-display.tsx` (New File): Create a new component dedicated to rendering the salary grid (Entry, Mid, Senior), location, and sources for a single path.
            
        - `client/src/components/results/purpose-paths.tsx`: Import and use the new `SalaryDisplay` component within the card layout. Pass the `path.salaryData` to it.
            
        - `client/src/components/results/salary-benchmarks.tsx`: Delete this file.
            
    - **Step Dependencies**: Step 2.
        
    - **User Instructions**: The main results page should no longer show a separate salary table. Each of the three path cards should now contain its own salary information.
        
    - **✅ COMPLETED**:
        - **Decision**: Embedded salary information directly within each Purpose Path card using a dedicated `SalaryDisplay` sub-component and removed the global `<SalaryBenchmarks />` table.
        - **Files Updated**:
            - `client/src/components/results/purpose-paths/_components/salary-display.tsx` – new fully-documented component that renders entry, mid & senior compensation, location and data sources.
            - `client/src/components/results/purpose-paths.tsx` – integrated `SalaryDisplay`, updated prop types to `PurposePathWithSalary`.
            - `client/src/pages/results.tsx` – deleted `salaryDataForTable` `useMemo`, removed `<SalaryBenchmarks />` invocation, and simplified PDF export call.
            - `client/src/components/results/salary-benchmarks.tsx` – deleted obsolete file.
        - **Edge Cases Considered**: Handles missing or null salary values gracefully by displaying an em-dash (—). Section is omitted altogether when no salary data is provided for a path.
        - **Follow-up**: No additional backend changes required. Existing failing tests are unrelated to this step and will be addressed in a future testing phase.
        
- [x] Step 4: Implement Path-Specific Chat Refinement (Frontend)
    
    - **Task**: Enable chat refinement for individual paths by moving the "Refine" button into each path card and updating the app's state management to track which path is being discussed.
        
    - **Files**:
        
        - `client/src/App.tsx`: Add new state, `chatPathId: number | null`. Update `handleOpenChat` to accept an optional `pathId` and set this state. Pass `chatPathId` to the `ChatInterface` component.
            
        - `client/src/pages/results.tsx`: Remove the global "Refine with Nami" button. Update the `onOpenChat` prop passed to `PurposePaths` to handle the new `pathId` argument.
            
        - `client/src/components/results/purpose-paths.tsx`: Add a new, smaller "Refine" button to each path card. This button will invoke the `onOpenChat` prop with the `path.id`.
            
        - `client/src/components/chat-interface.tsx`: Update `ChatInterfaceProps` to accept the optional `pathId`. In `handleSubmit`, include the `pathId` in the body of the `POST /api/chat` request if it's present.
            
    - **✅ COMPLETED**:
        - **Decision**: Introduced per-path chat refinement by adding `chatPathId` state at the app level and moving the "Refine" entrypoint into each individual Purpose Path card. This enables focused conversations tied to a single path while retaining full-page context for other chat types.
        - **Files Updated**:
            - `client/src/App.tsx` – added `chatPathId` state, enhanced `handleOpenChat` to accept optional `pathId`, passed `chatPathId` to `<ChatInterface />` and wired new handler to `<Results />` route.
            - `client/src/pages/results.tsx` – removed global "Refine with Nami" button, updated prop types, and forwarded `onOpenChat` with the relevant `pathId` to `<PurposePaths />`.
            - `client/src/components/results/purpose-paths.tsx` – added a secondary "Refine" button to each card, updated props interface, and invoked `onOpenChat(path.id)`.
            - `client/src/components/chat-interface.tsx` – accepted new optional `pathId` prop and conditionally included it in the `/api/chat` POST body.
            - `client/src/lib/i18n.ts` – added new translation key `results.refine` for both English and Spanish.
        - **Edge Cases Considered**: When `pathId` is `null`, chats default to the broader discovery or action-plan context. Chat history persists per context, not per path, to avoid excessive storage usage; future steps may expand this if needed.
        - **Follow-up**: Backend must now accept the optional `pathId` (handled in Step 5).
    - **Step Dependencies**: None.
        
    - **User Instructions**: The main "Refine with Nami" button on the results page has been removed. Each Purpose Path card now contains its own "Refine" button that opens the chat drawer focused on that specific path.
        
- [ ] Step 5: Implement Path-Specific Chat Refinement (Backend)
    
    - **Task**: Update the backend to process the `pathId` from the client, allowing the AI to generate a focused response based on the specific path the user wants to refine.
        
    - **Files**:
        
        - `shared/schema.ts`: Add `pathId: z.number().optional()` to the `chatRequestSchema`.
            
        - `server/routes/chat.ts`: In the `POST /api/chat` handler, extract the optional `pathId` and pass it to `getChatRefinementChain`.
            
        - `server/ai/chains.ts`: Modify `getChatRefinementChain` to accept the optional `pathId`. If an ID is provided, alter the `contextString` to contain data from only that specific path, creating a more focused prompt.
            
        - `server/ai/prompts.ts`: Update `getChatRefinementSystemPrompt` to reflect the more focused context when a single path is being discussed.
            
    - **Step Dependencies**: Step 4.
        
    - **User Instructions**: Clicking the new "Refine" button on a path card and asking a question like "Tell me more" should result in an AI response focused only on that path.
        

## Phase 2: Code Structure & Modularity

- [ ] Step 6: Split Monolithic Hooks and Server Files
    
    - **Task**: To improve maintainability and adhere to the "AI-first" principle of smaller, focused files, the large hook and AI chain files will be split into separate, feature-specific modules.
        
    - **Files**:
        
        - `client/src/hooks/use-create-assessment.ts` (New File): Move the `useCreateAssessment` logic here.
            
        - `client/src/hooks/use-create-action-plan.ts` (New File): Move the `useCreateActionPlan` logic here.
            
        - `client/src/hooks/use-get-action-plan.ts` (New File): Move the `useGetActionPlan` logic here.
            
        - `client/src/hooks/use-assessment.ts`: Delete this file after its contents have been moved. Update all imports in `client/pages/`.
            
        - `server/ai/chains/purpose-discovery.chain.ts` (New File): Move the `getPurposeDiscoveryChain` and its related helpers.
            
        - `server/ai/chains/action-plan.chain.ts` (New File): Move the `getActionPlanChain` and its related helpers.
            
        - `server/ai/chains/chat-refinement.chain.ts` (New File): Move the `getChatRefinementChain`.
            
        - `server/ai/chains/index.ts` (New File): Create a barrel file to export all the chain functions.
            
        - `server/ai/chains.ts`: Delete the original monolithic file. Update imports in `server/routes/`.
            
    - **Step Dependencies**: Phase 1.
        
    - **User Instructions**: The application's functionality should remain unchanged after this major refactoring.
        

## Phase 3: Testing & Documentation

- [ ] Step 7: Expand Test Coverage
    
    - **Task**: Increase confidence in the codebase by adding unit tests for critical hooks and integration tests for the primary API endpoint.
        
    - **Files**:
        
        - `client/src/hooks/__tests__/use-create-action-plan.test.ts` (New File): Add a new Vitest/Jest test file. Write a test that mocks the `apiRequest` and verifies that the `onSuccess` callback is triggered with the expected payload.
            
        - `server/__tests__/assessment.test.ts` (New File): Add a new `supertest` integration test. Write a test that sends a valid payload to `/api/action-plan` and asserts that it receives a `200 OK` response with a valid JSON body.
            
    - **Step Dependencies**: None.
        
    - **User Instructions**: Run `npm test` from the root directory. All new and existing tests should pass.