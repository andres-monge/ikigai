
## **Phase 1: Foundational AI & Core Experience**

This phase overhauls the core AI-generated content to meet quality standards and fixes the most significant UX issues.

- [x] **Step 1: Upgrade AI Model & Improve Core Drivers Analysis**
    
    - **Task:** The current analysis in the "What's popping out of your answers" section merely summarizes user input. This step will refine the system prompt as detailed below.
        
    - **Files:**
        
        - `server/ai/prompts.ts`: In `getPurposeDiscoverySystemPrompt`, refine the prompt, guided by the purpose_example and the prompting_guide provided, to: 
            
            - explicitly  identify and convey the threads that connect what the user has answered, and not to just summarize the user's answer for the desired tone and format for the `coreDriversAnalysis`.
            - Give each path a compelling name that is evocative and inspiring.
                
    - **Step Dependencies:** None. This is the foundational first step.
        
    - **User Instructions:** None.
        

---

- [x] **Step 2: Revamp Salary Data Generation and Display** *(Completed – 2025-06-29)*
    
    - **Decisions & Notes:**
        - Removed salary caching and switched to fresh per-request salary look-ups via the "Facts" model.
        - Simplified salary schema to a single `salaryRange` string plus source URLs.
        - Top-level `salaryData` omitted from final JSON; salary facts are embedded directly in `ikigaiAlignment.pay`.
        - Front-end `SalaryDisplay` component and supporting types deleted; pay narrative now covers compensation info.
        - All unit tests pass after refactor (`npm test`).
        
    - **Task:** Simplify the salary benchmark feature. Guided by the purpose_example in @prompt_examples.md and the @prompting_guide.md provided, the AI will be prompted to find a single, broad salary range for an analogous, standard job title. This data will be integrated directly into the `pay` section of the Ikigai Alignment, removing the separate salary table and the need for a separate `salaryData` object in the JSON. The misleading "updated hourly" text and its associated caching will be removed.
        
    - **Files:**
        
        - `server/ai/chains/purpose-discovery.chain.ts`:
            
            - In `_fetchAndCacheSalaries`, modify the prompt to the "Facts" model. Instruct it to find a **single broad salary range** for the given career. Add the instruction: "If the title is too niche, find the range for the closest standard job title."
                
            - In `_parseSalaryResponse`, update the logic to parse a single salary range instead of three levels.
                
            - Remove all interaction with `salaryCache`. The function will now fetch fresh data on every call.
                
        - `server/ai/schemas.ts`:
            
            - In `rawSalaryDataSchema`, simplify the fields to just `title`, `location`, `salaryRange`, and `sources`.
                
            - In `purposeDiscoveryResultSchema`, **remove** the `salaryData: z.array(rawSalaryDataSchema)` field entirely.
                
            - Update `purposeDiscoveryOpenApiSchema` to reflect the removal of the top-level `salaryData` property.
                
        - `server/ai/prompts.ts`:
            
            - In `getPurposeDiscoverySystemPrompt`, update the instructions for Step 3. The AI must now integrate the fetched salary data (and its sources) into the `ikigaiAlignment.pay` string, rather than passing it through the top-level `salaryData` field.
                
        - `server/routes/assessment.ts`:
            
            - Update the `/api/analyze` route logic to no longer create `salaryData` records in storage. The data from the "Facts" model will only be passed back to the "Reasoning" model.
                
        - `client/components/results/purpose-paths.tsx`:
            
            - Remove the `<SalaryDisplay />` component and its import.
                
        - `server/cache.ts`:
            
            - Remove the `salaryCache` export and the `SALARY_CACHE_TTL_MS` constant.
                
    - **Step Dependencies:** Step 1.
        
    - **User Instructions:** Delete the file `client/components/results/purpose-paths/_components/salary-display.tsx`.
        

---

- [ ] **Step 3: Overhaul Action Plan Generation**
    
    - **Task:** Transform the Action Plan from three brief ideas into a single, detailed, step-by-step roadmap with a timeline, guided by the action_plan_example in @prompt_examples.md and the @prompting_guide.md provided,. This involves a major prompt and schema overhaul and deprecating the "Where to find your people" section.
        
    - **Files:**
        
        - `server/ai/prompts.ts`:
            
            - Completely rewrite `getActionPlanSystemPrompt`. The new prompt will instruct the AI to generate a single, comprehensive plan with numbered milestones, concrete actions, and timelines. It will be guided by a one-shot example based on your provided text.
                
            - The prompt will instruct the AI to integrate "Skills to Learn" and their YouTube links into the relevant steps of the plan, not as a separate section.
                
        - `shared/schema.ts`:
            
            - Redefine `actionPlanSchema` to support the new structured format (e.g., an array of `milestones`, where each milestone has `title`, `timeline`, and an array of `actions`). Remove `peopleToNetworkWith`.
                
        - `server/ai/schemas.ts`:
            
            - Update `actionPlanOpenApiSchema` to match the new, detailed structure from `actionPlanSchema`. Remove `peopleToNetworkWith`.
                
        - `client/pages/action-plan.tsx`:
            
            - Completely redesign the component's render logic to display the new milestone-based action plan.
                
            - Remove the card/section for "Where to Find Your People".
                
            - The accordion for skills will be removed; skills and videos will now be rendered inline within the plan's steps.
                
        - `client/types/assessment.ts`:
            
            - Update the `ActionPlan` type to match the new schema from `shared/schema.ts`.
                
    - **Step Dependencies:** Step 1.
        
    - **User Instructions:** None.
        

---

- [ ] **Step 4: Fix Action Plan Loading & Navigation UX**
    
    - **Task:** Prevent the UI from freezing on the Results page while the Action Plan is being generated. The app should navigate to the `/action-plan` route immediately and display a loading state there.
        
    - **Files:**
        
        - `client/pages/results.tsx`:
            
            - In the `handleChoosePath` function, call `Maps('/action-plan')` _before_ calling `createActionPlan(pathId)`.
                
        - `client/pages/action-plan.tsx`:
            
            - The component already has a `isLoading` state from `useGetActionPlan`. Ensure the `ActionPlanSkeleton` it renders is visually prominent and provides clear feedback that the plan is being generated. No functional change is needed here, as the component will correctly display the skeleton until the data is loaded.
                
        - `client/hooks/use-create-action-plan.ts`:
            
            - In the `onSuccess` callback provided by `useMutation`, add a call to `queryClient.invalidateQueries({ queryKey: ['actionPlan', sessionId] })`. This ensures that after the mutation succeeds, the query on the action plan page is marked as stale and refetches the new data.
                
        - `client/lib/queryClient.ts`:
            
            - Export `queryClient` so it can be imported and used in the hook.
                
    - **Step Dependencies:** Step 3.
        
    - **User Instructions:** None.
        

---

## **Phase 2: Reliability & Polish**

This phase focuses on improving the reliability of external data and polishing the UI/UX with smaller, high-impact changes.

- [ ] **Step 5: Fix Broken YouTube Links with YouTube's API**
    
    - **Task:** Replace the unreliable web search for YouTube videos with direct calls to the YouTube Data API v3. This will ensure video links are valid and allows for displaying thumbnails.
        
    - **Files:**
        
        - `server/ai/chains/action-plan.chain.ts`:
            
            - In `_fetchAndCacheYoutubeVideos` (which should be renamed to `_fetchYoutubeVideos`), remove the call to `generateContentWithSearch`.
                
            - Instead, use `node-fetch` to call the YouTube Data API v3 `search.list` endpoint. You will need to construct the URL with the `key`, `part`, `q` (the skill), `type`, and `maxResults` parameters.
                
            - Parse the JSON response from the YouTube API to extract video titles, URLs, and thumbnail URLs.
                
            - The data returned by the function and stored in the cache should now be an array of objects, each containing `{ title, url, thumbnailUrl }`.
                
        - `server/ai/prompts.ts`:
            
            - In `getActionPlanSystemPrompt`, modify the function-calling step. The AI no longer needs to find videos itself; it just needs to identify the key skills. Update the `getYoutubeVideosForSkills` tool definition to reflect this if necessary, though the existing one should work.
                
        - `client/pages/action-plan.tsx`:
            
            - In the render logic for the action plan, where a YouTube link is present, render an `<img>` tag using the new `thumbnailUrl` field. Wrap it in an `<a>` tag pointing to the `url`.
                
            - Remove the accordion wrapper around the video links. Display all three recommended videos directly.
                
    - **Step Dependencies:** Step 3.
        
    - **User Instructions:**
        
        1. Go to the Google Cloud Console, enable the "YouTube Data API v3", and generate an API key.
            
        2. Add the new key to your `.env.local` file as `YOUTUBE_API_KEY=...`.
            
        3. Update `.env.example` with `YOUTUBE_API_KEY=`.
            

---

- [ ] **Step 6: Refine UI Text and Wording**
    
    - **Task:** Update various UI strings across the application to better match the desired tone and persona.
        
    - **Files:**
        
        - `client/lib/i18n.ts`:
            
            - Update `welcome.title` to "Find fulfilling work." and `welcome.description` to "Work doesn't have to suck. Stop waiting for the weekend to get here."
                
            - Update `results.subtitle` to "These are the paths I think you'd find fulfilling."
                
            - Update `results.purposePaths` to "Your Three Paths".
                
            - Update `loading.thinking` to "Let me cook...".
                
    - **Step Dependencies:** None.
        
    - **User Instructions:** None.
        

---

- [ ] **Step 7: Implement Auto-Resizing Textareas**
    
    - **Task:** Enhance the user input experience by making the text areas in the questionnaire and chat interface auto-resizing.
        
    - **Task Details:**
        
        - Install the `react-textarea-autosize` package: `npm install react-textarea-autosize`.
            
        - Replace the `<Textarea />` component from shadcn with the new `TextareaAutosize` component in the specified files.
            
    - **Files:**
        
        - `client/components/questionnaire/question-card.tsx`:
            
            - Import `TextareaAutosize` and use it for the question inputs. Apply the same base styling as the original `<Textarea>`.
                
        - `client/components/chat-interface.tsx`:
            
            - Import `TextareaAutosize` and replace the `<Input />` component used for chat messages with it to allow for multi-line, auto-expanding input. You may need to adjust the surrounding form styles.
                
    - **Step Dependencies:** None.
        
    - **User Instructions:** None.
        

---

- [ ] **Step 8: Simplify Chat Workflow**
    
    - **Task:** As requested, remove the streaming implementation for the chat refinement feature due to bugginess. Revert to a simpler, non-streaming request-response model.
        
    - **Files:**
        
        - `server/routes/chat.ts`:
            
            - Rewrite the `POST /api/chat` handler. Remove all SSE headers (`text/event-stream`).
                
            - It should now `await` the full response from the chain, then save the user and assistant messages to storage, and finally send the complete AI response back as a single JSON object.
                
        - `server/ai/chains/chat-refinement.chain.ts`:
            
            - Change the `getChatRefinementChain` function from an `async function*` (generator) to a standard `async function` that returns `Promise<string>`.
                
            - It should call `generateContent` (not `generateContentStream`) and return the complete text response from the AI.
                
        - `client/components/chat-interface.tsx`:
            
            - In the `handleSubmit` function, remove the `ReadableStream` processing logic.
                
            - Use a standard `await fetch(...)` call and `await response.json()` to get the complete message.
                
            - Update the `setMessages` logic to add the user message and a temporary "thinking" placeholder, then update the placeholder with the full response once it arrives.
                
    - **Step Dependencies:** None.
        
    - **User Instructions:** None.
        

---

- [ ] **Step 9: Minor Style Cleanup**
    
    - **Task:** Remove the red asterisks indicating required fields in the questionnaire for a cleaner look.
        
    - **Files:**
        
        - `client/components/questionnaire/question-card.tsx`:
            
            - In the JSX for the question `Label`, remove the conditional render: `{question.required && <span className="text-red-500 ml-1">*</span>}`.
                
    - **Step Dependencies:** None.
        
    - **User Instructions:** None.


Your answers for this were very good. I want to use the same format for my AI Pathfinder project. 

