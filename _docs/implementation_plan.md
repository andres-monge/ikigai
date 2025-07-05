
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
                
        - `client/src/components/results/purpose-paths.tsx`:
            
            - Remove the `<SalaryDisplay />` component and its import.
                
        - `server/cache.ts`:
            
            - Remove the `salaryCache` export and the `SALARY_CACHE_TTL_MS` constant.
                
    - **Step Dependencies:** Step 1.
        
    - **User Instructions:** Delete the file `client/src/components/results/purpose-paths/_components/salary-display.tsx`.
        

---

- [x] **Step 3: Overhaul Action Plan Generation**
    
    - **Task:** Transform the Action Plan from three brief ideas into a single, detailed, milestone-based roadmap. Each milestone contains a title, timeline, concrete actions and (optionally) embedded skills with YouTube resources. The deprecated "Where to find your people" section is removed.
        
    - **Files Updated:**  
        • shared/schema.ts → milestone-based `actionPlanSchema`  
        • server/ai/schemas.ts → new `actionPlanOpenApiSchema`  
        • server/ai/prompts.ts → rewritten `getActionPlanSystemPrompt`  
        • client/src/pages/action-plan.tsx → redesigned UI  
        • client/src/types/assessment.ts → new `Milestone` & revised `ActionPlan`  
        • client/src/lib/pdf-export.ts → milestone PDF export  
        • tests updated for new schema
        
    - **Step Dependencies:** Step 1.
        
    - **User Instructions:** None.
        

---

- [x] **Step 4: Fix Action Plan Loading & Navigation UX**
    
    - **Decisions & Notes:**
        - **The Problem:** Previously, when a user clicked "Choose this Path," the app would try to create the action plan and immediately navigate to the action plan page. If the plan wasn't ready, the screen would freeze or show a blank page. This is a common issue in web development called a "race condition," where the UI navigates to a new page before the data for that page is available.
        - **The Solution (A More Patient Approach):** We fixed this by making the app more patient. Instead of navigating right away, we now do the following:
            1.  **Show a Loading Screen:** When the user clicks the button, we immediately show a full-page loading overlay. This tells the user, "Hang on, I'm working on it!" and prevents them from clicking anything else.
            2.  **Wait for the Plan:** The app now patiently waits (`await`s) for the AI to finish creating the action plan.
            3.  **Navigate Safely:** Only *after* the plan is successfully created and stored does the app navigate to the `/action-plan` page.
        - **How It Works (The Code Details):**
            - We introduced a "state" variable in our Results page called `isGenerating`. Think of this as a light switch. It's `false` by default, but we flip it to `true` when the button is clicked, which turns on our `<LoadingOverlay>`.
            - We changed the function that creates the plan (`createActionPlan`) to be `async` (asynchronous). This is like telling the function, "This might take a while, so don't freeze the whole app. Just let me know when you're done." The rest of the app can keep running smoothly.
            - The `await` keyword is what tells the code to pause and wait for the `async` function to finish its job before moving on to the next line (the navigation).
        - **Benefits:** This change makes the app feel more robust and professional. It provides clear feedback to the user and ensures they only see the action plan page when it's truly ready, eliminating the frustrating freeze. This "stateful loading" pattern is a fundamental concept in building modern, user-friendly web applications.
    
    - **Task:** Prevent the UI from freezing on the Results page.  The Results page now keeps the user in place, shows a full-page "Generating your plan…" overlay, waits for the `createActionPlan` mutation to finish, **then** navigates to `/action-plan`.
        
    - **Files:**
        
        - `client/src/pages/results.tsx`:
            
            - Add local `isGenerating` state. When `true`, render a full-viewport overlay (`fixed`, z-index high) with a spinner and friendly progress text.
            - In `handleChoosePath`:
                ```ts
                setIsGenerating(true);
                await createActionPlan(pathId);   // mutation writes session w/ actionPlan
                navigate('/action-plan');        // safe to go – plan is ready
                ```
        
        - `client/src/pages/action-plan.tsx`:
            
            - No guard changes needed. It will mount with `actionPlan` present and render immediately. Keep the existing `ActionPlanSkeleton` as a fallback for extremely slow devices but it should rarely appear.
        
        - `client/src/hooks/use-create-action-plan.ts`:
            
            - The `onSuccess` cache invalidation is still recommended (`queryClient.invalidateQueries({ queryKey: ['actionPlan', sessionId] })`) but no longer critical to avoid a redirect race.
            
        - `client/src/lib/queryClient.ts`:
            
            - Export `queryClient` (if not already) so it can be imported in the hook.
        
    - **Developer Notes:**
        
        - Overlay should also disable the "Choose Path" buttons to avoid duplicate requests.
        - If the user hits the browser Back button during generation, ensure `isGenerating` resets to `false`.
        
    - **Step Dependencies:** Step 3.
        
    - **User Instructions:** None.
        

---

## **Phase 2: Reliability & Polish**

This phase focuses on improving the reliability of external data and polishing the UI/UX with smaller, high-impact changes.

- [x] **Step 5: Fix Broken YouTube Links with YouTube's API**
    
    - **Decisions & Notes:**
        - Replaced the unreliable search-based scraping with direct calls to the **YouTube Data API v3** via `node-fetch`.  The new helper `_fetchYoutubeVideos` fetches three high-quality videos per skill with titles, URLs, and thumbnails.
        - Added a required `thumbnailUrl` field across schemas (shared, OpenAPI, client types) and updated all tests & mocks.
        - Removed the legacy `_fetchAndCacheYoutubeVideos` + `generateContentWithSearch` pathway.
        - Updated the Action Plan UI to present resources as clickable thumbnail cards in a responsive grid.
        - All tests pass (`npm test`).
    
    - **Task:** Replace the unreliable web search for YouTube videos with direct calls to the YouTube Data API v3. This will ensure video links are valid and allows for displaying thumbnails.
        
    - **Files:**
        
        - `server/ai/chains/action-plan.chain.ts`:
            
            - In `_fetchAndCacheYoutubeVideos` (which should be renamed to `_fetchYoutubeVideos`), remove the call to `generateContentWithSearch`.
                
            - Instead, use `node-fetch` to call the YouTube Data API v3 `search.list` endpoint. You will need to construct the URL with the `key`, `part`, `q` (the skill), `type`, and `maxResults` parameters.
                
            - Parse the JSON response from the YouTube API to extract video titles, URLs, and thumbnail URLs.
                
            - The data returned by the function and stored in the cache should now be an array of objects, each containing `{ title, url, thumbnailUrl }`.
                
        - `server/ai/prompts.ts`:
            
            - In `getActionPlanSystemPrompt`, modify the function-calling step. The AI no longer needs to find videos itself; it just needs to identify the key skills. Update the `getYoutubeVideosForSkills` tool definition to reflect this if necessary, though the existing one should work.
                
        - `client/src/pages/action-plan.tsx`:
            
            - In the render logic for the action plan, where a YouTube link is present, render an `<img>` tag using the new `thumbnailUrl` field. Wrap it in an `<a>` tag pointing to the `url`.
                
            - Remove the accordion wrapper around the video links. Display all three recommended videos directly.
                
    - **Step Dependencies:** Step 3.
        
    - **User Instructions:**
        
        1. Go to the Google Cloud Console, enable the "YouTube Data API v3", and generate an API key.
            
        2. Add the new key to your `.env.local` file as `YOUTUBE_API_KEY=...`.
            
        3. Update `.env.example` with `YOUTUBE_API_KEY=`.
            

---

- [x] **Step 6: Improve YouTube Video Search Quality**
    
    - **Decisions & Notes:**
        - Enriched the YouTube search query to `"${skill} tutorial"` so the API surfaces learning-oriented videos instead of generic content.
        - Added stricter API filters (`videoCategoryId=27`, `safeSearch=none`, `publishedAfter=<1-year-ago ISO>`, `relevanceLanguage=<language>`).
        - Updated `_fetchYoutubeVideosForSkill` in `action-plan.chain.ts` accordingly with full JSDoc explaining the change.
        - All existing unit tests pass (`npm test`). No new tests were necessary because the change is isolated to the external API call which is already mocked in tests.
    
    - **Task:** Make the YouTube recommendations feel more relevant by (1) enriching the search query with learning-intent keywords and (2) tightening the `search.list` filters.
        
    - **Implementation Details:**
        1. **Enriched Query** – Build the `q` parameter as `"${skill} tutorial"`. (No path title appended.)
        2. **API Filters** – Add / update these query params:
            - `videoCategoryId=27`  // Education
            - `safeSearch=none`
            - `publishedAfter=<ISO date one year ago>`
            - `relevanceLanguage=<language>`
        3. Keep `maxResults=3` and **do not** change the ordering.
        
    - **Files:**
        
        - `server/ai/chains/action-plan.chain.ts`:
            
            - Modify `_fetchYoutubeVideosForSkill` to build the enhanced `q` string and include the new filters (`videoCategoryId`, `safeSearch`, `publishedAfter`).
            - Remove the domain-clue keywords from the query builder if present.
            
    - **Step Dependencies:** Step 5.
        
    - **User Instructions:** None.


---

- [x] **Step 7: Implement Auto-Resizing Textareas**
    
    - **Decisions & Notes:**
        - Added the lightweight `react-textarea-autosize` package (`npm install react-textarea-autosize`). This third-party component automatically adjusts its height as the user types, eliminating scroll-bars and improving overall readability.
        - Replaced the fixed-height `<Textarea />` in the **Questionnaire** with `<TextareaAutosize>`.
            - Kept the same visual styling (full-width, rounded border) and set `minRows={3}` / `maxRows={10}` so the field starts compact but grows naturally up to a comfortable size.
        - Replaced the single-line `<Input />` in the **Chat Interface** with `<TextareaAutosize>`.
            - Users can now write multi-line prompts. The field starts with one row and expands up to six rows before scrolling.
            - Existing send-button workflow is untouched; pressing the button submits, while pressing **Enter** inside the box simply creates a new line (standard chat UX).
        - Added proper TypeScript typings (`React.ChangeEvent<HTMLTextAreaElement>`) for the new `onChange` handlers to satisfy the linter.
        - All unit tests continue to pass (`npm test`). No new tests were necessary because the change is purely presentational.

    - **Implementation Explanation (For Non-Technical Stakeholders):**
        - Think of a regular text box as a fixed-size window—you can only see a small slice of what you write, so you need a scroll-bar when the content gets long. The new **auto-resizing text box** is more like a stretchy window. It automatically grows taller as you write more, always showing the full message. This small UX improvement makes long answers easier to review and edit, and it's a neat example of how small interface tweaks can significantly improve usability.

    - **Files Updated:**
        • `package.json` – new dependency added automatically by `npm install`.
        • `client/src/components/questionnaire/question-card.tsx` – swapped component & added styling.
        • `client/src/components/chat-interface.tsx` – swapped component, removed unused import, updated typings.

    - **Step Dependencies:** None.

    - **User Instructions:** None.

---

- [x] **Step 8: Simplify Chat Workflow** *(Completed – 2025-07-05)*
    
    - **Decisions & Notes:**
        - Removed fragile SSE streaming in both backend and frontend in favor of a straightforward request-response pattern.
        - Chat refinement chain now returns the complete AI reply via `generateContent`; backend route persists both user and assistant messages in one go.
        - Front-end no longer parses a stream; it shows a "thinking" placeholder while waiting for the full response, then swaps it in atomically.  This greatly reduces edge-case bugs and simplifies the codebase for future contributors.
        - All existing unit tests continue to pass (`npm test`). No new tests were required because behaviour remains functionally identical from the user's perspective.

    - **Task:** Remove the streaming implementation for the chat refinement feature due to bugginess. Revert to a simpler, non-streaming request-response model.
        
    - **Files:**
        
        - `server/routes/chat.ts`:
            
            - Rewrite the `POST /api/chat` handler. Remove all SSE headers (`text/event-stream`).
                
            - It should now `await` the full response from the chain, then save the user and assistant messages to storage, and finally send the complete AI response back as a single JSON object.
                
        - `server/ai/chains/chat-refinement.chain.ts`:
            
            - Change the `getChatRefinementChain` function from an `async function*` (generator) to a standard `async function` that returns `Promise<string>`.
                
            - It should call `generateContent` (not `generateContentStream`) and return the complete text response from the AI.
                
        - `client/src/components/chat-interface.tsx`:
            
            - In the `handleSubmit` function, remove the `ReadableStream` processing logic.
                
            - Use a standard `await fetch(...)` call and `await response.json()` to get the complete message.
                
            - Update the `setMessages` logic to add the user message and a temporary "thinking" placeholder, then update the placeholder with the full response once it arrives.
                
    - **Step Dependencies:** None.
        
    - **User Instructions:** None.
