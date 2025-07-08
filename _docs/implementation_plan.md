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

## Component - Single-Page Questionnaire
- [ ] **Step 2: Create `<SinglePageQuestionnaire>` component**
  - **Task**: Combine the eight existing question definitions into one flat list and render them as text-areas in a single form (no pagination, no progress bar).
  - **Files**  
    - `client/src/components/questionnaire/single-page-questionnaire.tsx` **(new)**:  
      - Accept props: `language`, `sessionId`, `onNavigate`, `onStartLoading`, `onStopLoading`.  
      - Import the `QUESTIONS` catalog and `buildRenderableQuestions` helper from `questionnaire.tsx`.  
      - Flatten all four arrays and map to `<textarea>` inputs (or reuse a stripped version of `<QuestionCard>`).  
      - Local component state mirrors the `"answers"` object from the old page.  
      - On **Submit** → call `useCreateAssessment`, then on success:
        1. `sessionStorage.setItem('session', JSON.stringify(data))`
        2. `onNavigate('/results')`
      - Show `<LoadingOverlay isVisible={isPending} … />`.
    - `client/src/pages/questionnaire.tsx`: Extract the helper `QUESTIONS` + `buildRenderableQuestions` into **`client/src/components/questionnaire/questions.ts`** so both old and new components share them (quick refactor).
  - **Step Dependencies**: Step 1 completed.  
  - **User Instructions**: n/a

## Home Page Integration
- [ ] **Step 3: Embed the new questionnaire in Home**
  - **Task**: Replace the “Start Your Journey” button flow so that clicking the button smoothly scrolls to the questionnaire section on the same page (or simply reveals it).
  - **Files**  
    - `client/src/pages/home.tsx`:  
      - Import `<SinglePageQuestionnaire>`.  
      - Add local `isFormVisible` state.  
      - On CTA button click: `setIsFormVisible(true)` and optionally `scrollIntoView`.  
      - Pass required props (`language`, `sessionId`, etc.).  
      - Wrap form section in a `<section id="questionnaire">` with consistent Tailwind spacing.  
  - **Step Dependencies**: Step 2.  
  - **User Instructions**: n/a

## UI Polish & Accessibility
- [ ] **Step 4: Basic styling for inline questionnaire**
  - **Task**: Make sure eight questions render nicely (one per row on mobile, two-column grid on ≥md screens). Enforce Tailwind spacing and keep large radius card container consistent with design system.
  - **Files**  
    - `client/src/components/questionnaire/single-page-questionnaire.tsx`:  
      - Add `grid grid-cols-1 md:grid-cols-2 gap-6` around questions.  
      - Use existing Tailwind utilities / `gradient-primary` classes for submit button.  
  - **Step Dependencies**: Step 2.  
  - **User Instructions**: Test keyboard navigation; each `<textarea>` should be `required`.

## i18n Updates
- [ ] **Step 5: Add / remove translation keys**
  - **Task**: Introduce any new copy strings (“Please answer the questions below”, “Submit”) and mark step-wizard-only keys for future removal.
  - **Files**  
    - `client/src/lib/i18n.ts`:  
      - Add `home.questionnaireIntro`, `home.submit`, etc. to both `en` and `es`.  
      - Comment `// TODO: remove step*.title keys when wizard is deleted`.  
  - **Step Dependencies**: Steps 2–4 (strings known).  
  - **User Instructions**: Translators review new Spanish copy.

## Cleanup & Dead Code Handling
- [ ] **Step 6: Flag deprecated wizard components for deletion**
  - **Task**: Document legacy code and ensure tree-shaking doesn’t include it.
  - **Files**  
    - `client/src/pages/questionnaire.tsx`, `client/src/components/questionnaire/question-card.tsx`:  
      - Add `/** @deprecated – replace with SinglePageQuestionnaire */` header.  
      - Export nothing new.  
    - `client/src/components/questionnaire/index.ts` (if present): Do **not** re-export deprecated modules.  
  - **Step Dependencies**: Step 1.  
  - **User Instructions**: After a sprint of stability, delete these files.

## Testing / QA
- [ ] **Step 7: Manual regression and quick unit tests**
  - **Task**: Verify the new flow on both languages and mobile/desktop breakpoints.
  - **Files**  
    - `client/src/__tests__/home-questionnaire.spec.tsx` **(new)** – Jest + React Testing Library smoke test:  
      1. Render Home, click CTA, fill eight inputs, submit.  
      2. Assert `LoadingOverlay` appears then `navigate('/results')` stub called.  
  - **Step Dependencies**: Steps 1–4.  
  - **User Instructions**: Run `npm test`.

---

### Success Criteria (Definition of Done)

1. Clicking **“Start Your Journey”** on `/` instantly reveals/scolls to the 8-question form.
2. Completing the form and hitting **Submit** triggers the same backend flow; on success the app navigates to `/results` without visiting `/questionnaire`.
3. `sessionStorage['session']` is populated, and the Results page renders normally.
4. The old multi-step route is unreachable via URL and tree-shaken from production bundles.
5. All eslint, type-check, and unit tests pass.

By following these atomic steps an AI (or human) implementer can apply the change set incrementally while preserving existing functionality and code conventions.
