/**
 * @file journey.spec.ts
 * 
 * @description
 * End-to-end test for the core user journey through the Ikigai Finder application.
 * This test validates the complete flow from questionnaire submission through
 * results display to action plan generation, using the new streamObject implementation.
 * 
 * The test serves as a safety net before cleanup (Phase 5) to ensure the user 
 * journey works correctly with the AI SDK's native streaming protocol.
 * 
 * @test-strategy
 * - Focuses on the happy path user journey
 * - Uses realistic test data to trigger meaningful AI responses
 * - Implements smart waiting strategies for streamed content
 * - Validates structure over specific content to avoid brittle tests
 * - Takes screenshots at key points for debugging
 */

import { test, expect } from '@playwright/test';

// Configure longer timeout for AI streaming operations
const AI_STREAMING_TIMEOUT = 60000; // 60 seconds

// Short, simple test data to avoid AI timeout issues
const TEST_RESPONSES = {
  passions: {
    q1: "Building websites and teaching people about technology",
    q2: "AI and machine learning for education"
  },
  skills: {
    q1: "Explaining complex things simply, problem-solving, web development",
    q2: "5 years as frontend developer, led UI redesign projects"
  },
  values: {
    q1: "Digital divide in education, lack of access to learning resources",
    q2: "Help students get tech jobs through better educational tools"
  },
  economic: {
    q1: "Remote work, flexible hours, eventually self-employed",
    q2: "Need $80k+ salary, financial stability for family"
  }
};

test.describe('Core User Journey', () => {
  // Real AI streaming + polling requires generous timeout
  test.setTimeout(120000);

  test('Complete flow: Questionnaire → Results → Action Plan', async ({ page }) => {
    // Set up console error logging for debugging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser console error:', msg.text());
      }
    });

    // ========================================================================
    // Step 1: Navigate to Home Page and Fill Questionnaire
    // ========================================================================
    
    await test.step('Navigate to home page', async () => {
      await page.goto('/');
      
      // Clear any existing session storage to avoid concurrency conflicts
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      
      // Refresh to get a fresh sessionId
      await page.reload();
      
      // Verify the questionnaire is visible (use data-testid, not heading text)
      await expect(page.locator('[data-testid="questionnaire-submit"]')).toBeVisible({ timeout: 10000 });
      
      // Take screenshot of initial state
      await page.screenshot({ path: 'test-screenshots/01-home-page.png', fullPage: true });
    });

    await test.step('Fill out questionnaire', async () => {
      // Fill Passions questions
      await page.fill('#passions\\.q1', TEST_RESPONSES.passions.q1);
      await page.fill('#passions\\.q2', TEST_RESPONSES.passions.q2);
      
      // Fill Skills questions
      await page.fill('#skills\\.q1', TEST_RESPONSES.skills.q1);
      await page.fill('#skills\\.q2', TEST_RESPONSES.skills.q2);
      
      // Fill Values questions
      await page.fill('#values\\.q1', TEST_RESPONSES.values.q1);
      await page.fill('#values\\.q2', TEST_RESPONSES.values.q2);
      
      // Fill Economic questions
      await page.fill('#economic\\.q1', TEST_RESPONSES.economic.q1);
      await page.fill('#economic\\.q2', TEST_RESPONSES.economic.q2);
      
      // Take screenshot of filled questionnaire
      await page.screenshot({ path: 'test-screenshots/02-questionnaire-filled.png', fullPage: true });
    });

    await test.step('Submit questionnaire and navigate to results', async () => {
      // Click the submit button
      await page.click('[data-testid="questionnaire-submit"]');
      
      // Wait for navigation to results page
      await page.waitForURL('**/results', { timeout: 10000 });
      
      // Verify we're on the results page
      expect(page.url()).toContain('/results');
    });

    // ========================================================================
    // Step 2: Validate Results Page with Streamed Content
    // ========================================================================
    
    await test.step('Wait for and validate Core Drivers Analysis', async () => {
      // Wait for results page heading (structural — any h2 on results page)
      await expect(page.locator('h2').first()).toBeVisible();

      // Core drivers <li> elements only exist after streaming completes and
      // ReactMarkdown renders in completed mode. This wait gates on that transition.
      const listItems = page.locator('main li');
      await expect(listItems.first()).toBeVisible({ timeout: AI_STREAMING_TIMEOUT });

      // Ensure the list item has substantial content
      await expect(async () => {
        const text = await listItems.first().textContent();
        expect(text?.length).toBeGreaterThan(20);
      }).toPass({ timeout: 10000 });

      // Take screenshot of core drivers
      await page.screenshot({ path: 'test-screenshots/03-core-drivers.png', fullPage: true });
    });

    await test.step('Validate Purpose Paths are populated', async () => {
      // Wait for purpose paths section heading (structural — h3 after h2)
      await expect(page.locator('h3').first()).toBeVisible({ timeout: AI_STREAMING_TIMEOUT });

      // Ensure we have 3 complete path cards with titles (scoped to path cards)
      const pathTitles = page.locator('[data-path-id] h4');
      await expect(pathTitles).toHaveCount(3);

      // Validate each path title has substantial content
      for (let i = 0; i < 3; i++) {
        await expect(async () => {
          const text = await pathTitles.nth(i).textContent();
          expect(text?.length).toBeGreaterThan(10);
        }).toPass();
      }

      // Ensure all action plan buttons are present (via data-testid)
      const actionButtons = page.locator('[data-testid="get-action-plan"]');
      await expect(actionButtons).toHaveCount(3);

      // Verify each path card has 4 ikigai alignment items (structural — colored dots)
      const pathCards = page.locator('[data-path-id]');
      for (let i = 0; i < 3; i++) {
        const alignmentDots = pathCards.nth(i).locator('[class*="rounded-full"][class*="bg-ikigai-"]');
        await expect(alignmentDots).toHaveCount(4);
      }

      // Take screenshot of purpose paths
      await page.screenshot({ path: 'test-screenshots/04-purpose-paths.png', fullPage: true });
    });

    // ========================================================================
    // Step 3: Select a Path and Navigate to Action Plan
    // ========================================================================
    
    await test.step('Select first purpose path', async () => {
      // Wait for path cards to have positive data-path-id values (real DB IDs).
      // Timeout covers: streaming completion + completed-mode re-render +
      // polling schedule in use-streaming-state.ts [500, 1000, 2000, 4000, 8000]ms
      const pathCards = page.locator('[data-path-id]');
      await expect(async () => {
        const count = await pathCards.count();
        expect(count).toBe(3);
        for (let i = 0; i < count; i++) {
          const id = Number(await pathCards.nth(i).getAttribute('data-path-id'));
          expect(id).toBeGreaterThan(0);
        }
      }).toPass({ timeout: 30000 });

      // Locate the first path card's action button and click it
      const firstPathCard = pathCards.first();
      const actionButton = firstPathCard.locator('[data-testid="get-action-plan"]');
      await expect(actionButton).toBeVisible();
      await expect(actionButton).toBeEnabled();
      await actionButton.click();

      // Wait for navigation to action plan page with a positive pathId
      await page.waitForURL('**/action-plan?pathId=*', { timeout: 10000 });
      expect(page.url()).toContain('/action-plan');
      expect(page.url()).toMatch(/pathId=[1-9]\d*/);
    });

    // ========================================================================
    // Step 4: Validate Action Plan Page with Streamed Content
    // ========================================================================
    
    await test.step('Wait for and validate Action Plan is populated', async () => {
      // Wait for action plan heading (structural)
      await expect(page.locator('h2').first()).toBeVisible({ timeout: AI_STREAMING_TIMEOUT });
      expect(page.url()).toContain('/action-plan');

      // Wait for milestone cards — each has an h3 title inside a retro-card
      const milestoneHeadings = page.locator('.retro-card-results h3');
      await expect(milestoneHeadings.first()).toBeVisible({ timeout: AI_STREAMING_TIMEOUT });

      // Verify we have multiple milestones (at least 3)
      await expect(async () => {
        const count = await milestoneHeadings.count();
        expect(count).toBeGreaterThanOrEqual(3);
      }).toPass({ timeout: 10000 });

      // Validate milestone headings have substantial content
      await expect(async () => {
        const text = await milestoneHeadings.first().textContent();
        expect(text?.length).toBeGreaterThan(10);
      }).toPass({ timeout: 10000 });

      // Take screenshot of action plan
      await page.screenshot({ path: 'test-screenshots/05-action-plan.png', fullPage: true });
    });

    await test.step('Validate Action Plan UI controls', async () => {
      // Wait for action buttons to appear (they render after all milestones)
      const exportButton = page.locator('[data-testid="export-pdf"]');
      const backButton = page.locator('[data-testid="back-to-paths"]');

      await expect(exportButton).toBeVisible({ timeout: 10000 });
      await expect(backButton).toBeVisible({ timeout: 10000 });

      // Take final screenshot
      await page.screenshot({ path: 'test-screenshots/06-complete-journey.png', fullPage: true });
    });

    // ========================================================================
    // Step 5: Verify No Errors Occurred
    // ========================================================================
    
    await test.step('Verify no error toasts appeared', async () => {
      // Check that no destructive toasts (error messages) are visible
      const errorToasts = page.locator('.destructive');
      await expect(errorToasts).toHaveCount(0);
    });
  });
});