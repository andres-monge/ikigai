# Implementation Plan
Step-by-step Implementation Plan for merging the questionnaire into the landing page and sending the user straight to /results after submission.
## Routing & Navigation
- [x] **Step 1: Remove `/questionnaire` route** – completed ✅
  - **Task**: Eliminate the dedicated questionnaire page from the router so the SPA no longer navigates away from `/`.
  - **Files**  
    - `client/src/App.tsx`:  
      - Delete the `<Route path="/questionnaire" …>` entry.  
      - Remove the `Questionnaire` import.  
      - Update the `Route="/"` component tree placeholder comment to show that it now renders Home **with** the form.  
    - `client/src/pages/questionnaire.tsx`: *No code changes*, but add a top-of-file comment `/** @deprecated – superseded by SinglePageQuestionnaire */`.  
  - **Step Dependencies**: none  
  - **User Instructions**: n/a (automatic on build)
  - **Implementation Notes**: Removed the obsolete route and import from `App.tsx`. Added a deprecation banner to `questionnaire.tsx` to signal future removal. The landing page now implicitly includes the questionnaire (to be embedded in Step 2), ensuring users stay on `/` during the flow. No additional logic changes were required.

## Component – Single-Page Questionnaire
- [x] **Step 2: Build `<SinglePageQuestionnaire>` with autosizing inputs**  
  - **Task**: Create a one-page form that renders all 8 questions **using `TextareaAutosize`** so they grow with content.  
  - **Files**  
    - `client/src/components/questionnaire/single-page-questionnaire.tsx` **(new)**  
      - Import `TextareaAutosize` from `react-textarea-autosize`.  
      - Reuse the `QUESTIONS` catalog; flatten to eight items.  
      - Each question renders as:  
        ```tsx
        <TextareaAutosize
          value={answers[id] || ''}
          onChange={(e) => setAnswers({...})}
          className="w-full resize-none border rounded-md p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          minRows={3}
          maxRows={10}
          required
        />
        ```  
    - `client/src/components/questionnaire/questions.ts` – extract static data.  
  - **Step Dependencies**: Step 1  
  - **User Instructions**: run `npm i react-textarea-autosize` if not already installed (it is, via `question-card.tsx`).  
  - **Implementation Notes**: Introduced a *self-contained* `SinglePageQuestionnaire` component that reproduces the wizard’s submission logic without pagination.  The new `questions.ts` file centralises bilingual question strings so both the wizard and future components can import them.  On submit, the component validates that every textarea is filled, calls `useCreateAssessment`, persists the `FullAssessment` in `sessionStorage`, shows a `LoadingOverlay` during processing, and navigates to `/results` upon success.

## Home Page Integration
- [x] **Step 3: Display questionnaire inline (no CTA button)**
  - **Task**: Delete the CTA button and render the form directly after the hero title/subtitle.  
  - **Files**  
    - `client/src/pages/home.tsx`  
      - Removed `Button`, `PlayCircle`, `useLocation`, and stale navigation logic.  
      - Added `SinglePageQuestionnaire` import and rendered it inside a `<div className="mt-12"> … </div>` block immediately after the hero section.  
      - Extended `HomeProps` to accept `sessionId`; the parent router now injects this prop.  
    - `client/src/App.tsx`  
      - Passed `sessionId` to `<Home … />` route to satisfy new prop contract.  
    - `client/src/lib/i18n.ts`  
      - Deleted obsolete `welcome.startButton` keys from both `en` and `es` translation objects.  
  - **Step Dependencies**: Step 2  
  - **Implementation Notes**: Users now start typing their answers without an extra click, reducing friction. The inline component reuses the same backend mutation logic, session persistence, and loading overlay as the standalone wizard, ensuring parity with the old flow. No additional CSS was required beyond a simple `mt-12` margin to maintain visual breathing room. Existing informational icons (duration, no-account, PDF export) remain unchanged.

## UI Polish & Accessibility
- [x] **Step 4: Basic styling for inline questionnaire** – completed ✅
  - **Task**: Make sure eight questions render nicely (one per row on **all** screen sizes). Enforce Tailwind spacing and keep the large-radius card container consistent with the design system.
  - **Files**  
    - `client/src/components/questionnaire/single-page-questionnaire.tsx`:  
      - Ensured a single-column grid using `grid grid-cols-1 gap-6` so each question occupies its own row regardless of viewport width.  
      - Updated the submit `<Button>` to use the brand `gradient-primary` background and `text-primary-foreground` for optimal contrast.  
  - **Step Dependencies**: Step 2  
  - **Implementation Notes**: The container already satisfied the large-radius (`rounded-2xl`) card requirement from the design system. The simplified grid keeps the UI predictable on larger screens while preserving full keyboard accessibility and validation of required fields.

## i18n Updates
- [x] **Step 5: Add / remove translation keys** – completed ✅
  - **Task**: Introduce any new copy strings (“Please answer the questions below”, “Submit”) and mark step-wizard-only keys for future removal.
  - **Files**  
    - `client/src/lib/i18n.ts`:  
      - Added `home.questionnaireIntro`, `home.submit` keys in both `en` and `es`.  
      - Added comment to flag removal of `step*.title` keys once multi-step wizard is deleted.  
  - **Step Dependencies**: Steps 2–4  
  - **Implementation Notes**: New i18n keys allow the Single Page Questionnaire to display introduction copy and a concise submit button label. This prepares the UI for further refinement while keeping the codebase future-proof. Existing step-wizard keys have been tagged for cleanup after the legacy flow is removed. Translators have clear markers for new Spanish strings.

## Cleanup & Dead Code Handling
- [x] **Step 6: Flag deprecated wizard components for deletion** – completed ✅
  - **Task**: Document legacy code and ensure tree-shaking doesn’t include it.
  - **Files**  
    - `client/src/pages/questionnaire.tsx`, `client/src/components/questionnaire/question-card.tsx`:  
      - Add `/** @deprecated – replace with SinglePageQuestionnaire */` header.  
      - Export nothing new.  
    - `client/src/components/questionnaire/index.ts` (if present): Do **not** re-export deprecated modules.  
  - **Step Dependencies**: Step 1.  
  - **Implementation Notes**: Added a deprecation banner to `question-card.tsx`, matching the existing one in `questionnaire.tsx`. This documents the legacy wizard code and ensures maintainers can safely delete it later. Because these components are no longer imported by active routes, Vite's tree-shaking excludes them from production bundles. No `index.ts` barrel file exists, preventing accidental re-exports.
  - **User Instructions**: After a sprint of stability, delete these files.

## Testing / QA
- [x] **Step 7: Manual regression and quick unit tests** – completed ✅
  - **Task**: Provide an automated smoke test that guarantees the inline questionnaire flow works end-to-end without a real backend.
  - **Files**  
    - `client/src/__tests__/home-questionnaire.spec.tsx` **(new)** – Vitest + React Testing Library test:  
      1. Renders the `Home` page with English locale and a fake `sessionId`.  
      2. Programmatically fills all eight textarea questions with sample answers.  
      3. Clicks the **Complete Assessment** button.  
      4. Asserts that the `LoadingOverlay` becomes visible.  
      5. Verifies that the mocked `navigate('/results')` function is called, confirming successful flow completion.  
  - **Implementation Notes**: The test stubs `useCreateAssessment` to avoid network requests and sets `isPending` to `true` so loading UI is exercised. Navigation is intercepted by mocking `wouter`'s `useLocation`. The test runs under the default **jsdom** environment and lives inside the shared `__tests__` directory, making it automatically picked up by `vitest`.  
  - **Step Dependencies**: Steps 1–4.  
  - **User Instructions**: Run `npm test` or `npm run test:ui` to execute the suite and view results.

---

### Success Criteria (Definition of Done)

1. Clicking **“Start Your Journey”** on `/` instantly reveals/scolls to the 8-question form.
2. Completing the form and hitting **Submit** triggers the same backend flow; on success the app navigates to `/results` without visiting `/questionnaire`.
3. `sessionStorage['session']` is populated, and the Results page renders normally.
4. The old multi-step route is unreachable via URL and tree-shaken from production bundles.
5. All eslint, type-check, and unit tests pass.

By following these atomic steps an AI (or human) implementer can apply the change set incrementally while preserving existing functionality and code conventions.
