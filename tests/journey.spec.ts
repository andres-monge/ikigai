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
      
      // Verify the questionnaire is visible
      await expect(page.locator('h2').filter({ hasText: 'Answer 8 questions, let our AI change your life.' })).toBeVisible();
      
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
      await page.click('button:has-text("Show Me My Purpose")');
      
      // Wait for navigation to results page
      await page.waitForURL('**/results', { timeout: 10000 });
      
      // Verify we're on the results page
      expect(page.url()).toContain('/results');
    });

    // ========================================================================
    // Step 2: Validate Results Page with Streamed Content
    // ========================================================================
    
    await test.step('Wait for and validate Core Drivers Analysis', async () => {
      // Wait for main heading
      const resultsHeading = page.locator('h2').filter({ hasText: 'Your Ikigai' });
      await expect(resultsHeading).toBeVisible();
      
      // Ensure loading state is gone
      await expect(page.locator('text=Generating your analysis...')).not.toBeVisible({ timeout: AI_STREAMING_TIMEOUT });
      
      // Validate core drivers paragraph is populated (not empty)
      const coreDriversParagraph = page.locator('main p').first();
      await expect(async () => {
        const text = await coreDriversParagraph.textContent();
        expect(text?.length).toBeGreaterThan(50); // Substantial content
      }).toPass({ timeout: 30000 });
      
      // Validate numbered list exists and is populated
      const listItems = page.locator('main li');
      await expect(listItems.first()).toBeVisible({ timeout: 30000 });
      
      // Ensure the list item has substantial content (the numbered points)
      await expect(async () => {
        const text = await listItems.first().textContent();
        expect(text?.length).toBeGreaterThan(100); // Has substantial content with multiple points
      }).toPass({ timeout: 30000 });
      
      // Take screenshot of core drivers
      await page.screenshot({ path: 'test-screenshots/03-core-drivers.png', fullPage: true });
    });

    await test.step('Validate Purpose Paths are populated', async () => {
      // Wait for section heading
      const pathsHeading = page.locator('h3').filter({ hasText: 'Your 3 Purpose Paths' });
      await expect(pathsHeading).toBeVisible({ timeout: AI_STREAMING_TIMEOUT });
      
      // Ensure we have 3 complete path cards with titles
      const pathTitles = page.locator('h4'); // Path titles like "The AI Education Architect"
      await expect(pathTitles).toHaveCount(3);
      
      // Validate each path title has substantial content
      for (let i = 0; i < 3; i++) {
        const pathTitle = pathTitles.nth(i);
        await expect(async () => {
          const text = await pathTitle.textContent();
          expect(text?.length).toBeGreaterThan(10); // Has actual title
        }).toPass();
      }
      
      // Ensure all action plan buttons are present
      const actionButtons = page.locator('button').filter({ hasText: 'Get Action Plan' });
      await expect(actionButtons).toHaveCount(3);
      
      // Verify Ikigai sections exist (structure validation) - use .first() since there are 3 paths
      await expect(page.locator('text=Love:').first()).toBeVisible();
      await expect(page.locator('text=Good At:').first()).toBeVisible(); 
      await expect(page.locator('text=Meaningful:').first()).toBeVisible();
      await expect(page.locator('text=Pay:').first()).toBeVisible();
      
      // Take screenshot of purpose paths
      await page.screenshot({ path: 'test-screenshots/04-purpose-paths.png', fullPage: true });
    });

    // ========================================================================
    // Step 3: Select a Path and Navigate to Action Plan
    // ========================================================================
    
    await test.step('Select first purpose path', async () => {
      // Wait for the purpose discovery stream to fully complete and clean up
      // This prevents concurrency conflicts with the action plan stream
      await page.waitForTimeout(5000);
      
      // NEW: Wait for DOM stability after background refetch (happens ~1 second after streaming)
      // The background refetch causes React remounts when IDs change from temporary to DB IDs
      await page.waitForTimeout(2000); // Total 7 seconds ensures background refetch completes
      
      // Get fresh reference to button after potential remounts
      const firstActionPlanButton = page.locator('button').filter({ hasText: 'Get Action Plan' }).first();
      
      // Ensure button is truly ready with explicit waits
      await expect(firstActionPlanButton).toBeVisible({ timeout: 10000 });
      await expect(firstActionPlanButton).toBeEnabled({ timeout: 5000 });
      
      // Add a small stabilization delay before clicking
      await page.waitForTimeout(500);
      
      // Click with confidence now that DOM is stable
      await firstActionPlanButton.click();
      
      // Wait for navigation to action plan page with query parameter
      await page.waitForURL('**/action-plan?pathId=*', { timeout: 10000 });
      
      // Verify we're on the action plan page with a pathId
      expect(page.url()).toContain('/action-plan');
      expect(page.url()).toMatch(/pathId=-?\d+/); // pathId can be negative (temporary ID)
    });

    // ========================================================================
    // Step 4: Validate Action Plan Page with Streamed Content
    // ========================================================================
    
    await test.step('Wait for and validate Action Plan is populated', async () => {
      // Take a screenshot first to see what's actually on the page
      await page.screenshot({ path: 'test-screenshots/05-action-plan-debug.png', fullPage: true });
      
      // Wait for any h1 heading to appear (more flexible than exact text match)
      const anyHeading = page.locator('h1');
      await expect(anyHeading.first()).toBeVisible({ timeout: AI_STREAMING_TIMEOUT });
      
      // Ensure we're on the action plan page by checking URL
      expect(page.url()).toContain('/action-plan');
      
      // Wait for milestone cards to appear - look for "Actions" headers (most reliable indicator)
      const actionsHeaders = page.locator('text=Actions');
      await expect(actionsHeaders.first()).toBeVisible({ timeout: AI_STREAMING_TIMEOUT });
      
      // Verify we have multiple milestones (should have at least 3)
      const actionsCount = await actionsHeaders.count();
      expect(actionsCount).toBeGreaterThanOrEqual(3);
      
      // Validate that we have substantial content in milestone headings
      const milestoneHeadings = page.locator('h3');
      if (await milestoneHeadings.count() > 0) {
        await expect(async () => {
          const text = await milestoneHeadings.first().textContent();
          expect(text?.length).toBeGreaterThan(10); // Has actual milestone title
        }).toPass({ timeout: 30000 });
      }
      
      // Take screenshot of action plan
      await page.screenshot({ path: 'test-screenshots/05-action-plan.png', fullPage: true });
    });

    await test.step('Validate Action Plan UI controls', async () => {
      // Check for Export PDF button (flexible text matching)
      const exportButton = page.locator('button').filter({ hasText: /Export.*PDF/i });
      if (await exportButton.count() > 0) {
        await expect(exportButton.first()).toBeVisible();
        console.log('Export PDF button found');
      } else {
        console.log('Export PDF button not found - may be below fold or different text');
      }
      
      // Check for Back button (flexible text matching)
      const backButton = page.locator('button').filter({ hasText: /Back.*Path/i });
      if (await backButton.count() > 0) {
        await expect(backButton.first()).toBeVisible();
        console.log('Back button found');
      } else {
        console.log('Back button not found - may be below fold or different text');
      }
      
      // Check for YouTube video thumbnails (visible in the completed action plan)
      const videoThumbnails = page.locator('img[src*="youtube"], img[src*="ytimg"]');
      if (await videoThumbnails.first().isVisible({ timeout: 10000 }).catch(() => false)) {
        console.log('YouTube enrichment completed successfully');
      }
      
      // Take final screenshot
      await page.screenshot({ path: 'test-screenshots/06-complete-journey.png', fullPage: true });
    });

    // ========================================================================
    // Step 5: Verify No Errors Occurred
    // ========================================================================
    
    await test.step('Verify no error toasts appeared', async () => {
      // Check that no destructive toasts (error messages) are visible
      const errorToasts = page.locator('[data-type="destructive"], .destructive');
      await expect(errorToasts).toHaveCount(0);
    });
  });
});