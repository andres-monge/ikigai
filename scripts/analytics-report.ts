/**
 * @description
 * Funnel metrics report script for the Ikigai Finder analytics system.
 *
 * Calculates and displays all success metrics defined in the analytics implementation plan:
 * - Landing → Start conversion
 * - Completion rate
 * - Section drop-off analysis
 * - Results → Action Plan conversion
 * - Export rates (Results, Action Plan, Overall)
 * - Restart rate
 *
 * @usage
 * DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/analytics-report.ts
 * DATABASE_URL="$DEV_DATABASE_URL" npx tsx scripts/analytics-report.ts --days=7
 * DATABASE_URL="$DEV_DATABASE_URL" npx tsx scripts/analytics-report.ts --days=30
 */

import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { sql, eq, gte, isNotNull, and, count, countDistinct } from 'drizzle-orm';
import ws from 'ws';
import * as schema from '../shared/schema.js';

const { analyticsEvents, assessmentSessions, purposePaths } = schema;

// Configure WebSocket for Node.js environments
neonConfig.webSocketConstructor = ws;

/* -------------------------------------------------------------------------- */
/* CLI Argument Parsing                                                        */
/* -------------------------------------------------------------------------- */

function parseArgs(): { days: number | null } {
  const args = process.argv.slice(2);
  let days: number | null = null;

  for (const arg of args) {
    if (arg.startsWith('--days=')) {
      const rawValue = arg.split('=')[1];
      const value = parseInt(rawValue, 10);
      if (isNaN(value) || value <= 0) {
        console.error(`Error: Invalid value for --days: "${rawValue}"`);
        console.error('Expected a positive number, e.g., --days=7 or --days=30');
        process.exit(1);
      }
      days = value;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npx tsx scripts/analytics-report.ts [--days=N]');
      console.log('');
      console.log('Options:');
      console.log('  --days=N    Filter to last N days (default: all time)');
      console.log('  --help, -h  Show this help message');
      console.log('');
      console.log('Environment:');
      console.log('  DATABASE_URL  Required. PostgreSQL connection string.');
      process.exit(0);
    } else {
      console.error(`Error: Unknown argument: ${arg}`);
      console.error('Usage: npx tsx scripts/analytics-report.ts [--days=N]');
      console.error('Run with --help for more information.');
      process.exit(1);
    }
  }

  return { days };
}

/* -------------------------------------------------------------------------- */
/* Helper Functions                                                            */
/* -------------------------------------------------------------------------- */

function formatPercentage(value: number): string {
  if (isNaN(value) || !isFinite(value)) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
}

function formatMetric(name: string, value: string, counts: string): void {
  console.log(`  ${name.padEnd(30)} ${value.padStart(8)}  (${counts})`);
}

/* -------------------------------------------------------------------------- */
/* Main Report Function                                                        */
/* -------------------------------------------------------------------------- */

async function generateReport(): Promise<void> {
  const { days } = parseArgs();

  // Validate DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // Create database connection with schema for type-safe queries
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });

  // Verify required tables exist before running queries
  try {
    await db.select({ count: count() }).from(analyticsEvents).limit(1);
  } catch (error) {
    console.error('\nError: Required database tables not found.');
    console.error('Please ensure the database schema is up to date.');
    console.error('Run: npm run db:push\n');
    await pool.end();
    process.exit(1);
  }

  // Calculate date filter if specified
  const dateFilter = days
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    : null;

  console.log('\n' + '='.repeat(70));
  console.log(' IKIGAI FINDER - ANALYTICS REPORT');
  console.log('='.repeat(70));
  console.log(`\n  Period: ${days ? `Last ${days} days` : 'All time'}`);
  console.log(`  Generated: ${new Date().toISOString()}`);
  console.log('\n' + '-'.repeat(70));

  try {
    // -------------------------------------------------------------------------
    // Query 1: Event counts by type
    // -------------------------------------------------------------------------
    const eventCountsQuery = dateFilter
      ? db
          .select({
            eventType: analyticsEvents.eventType,
            count: count(),
          })
          .from(analyticsEvents)
          .where(gte(analyticsEvents.createdAt, dateFilter))
          .groupBy(analyticsEvents.eventType)
      : db
          .select({
            eventType: analyticsEvents.eventType,
            count: count(),
          })
          .from(analyticsEvents)
          .groupBy(analyticsEvents.eventType);

    const eventCounts = await eventCountsQuery;
    const eventMap = new Map<string, number>(
      eventCounts.map((e) => [e.eventType, e.count])
    );

    const visitEvents = eventMap.get('visit') ?? 0;
    const startEvents = eventMap.get('start') ?? 0;
    const sectionEvents = eventMap.get('section') ?? 0;
    const exportEvents = eventMap.get('export') ?? 0;
    const startOverEvents = eventMap.get('start_over') ?? 0;

    // -------------------------------------------------------------------------
    // Query 2: Distinct sessions that exported by page (for true conversion rates)
    // -------------------------------------------------------------------------
    const resultsExportSessionsQuery = dateFilter
      ? db
          .select({ count: countDistinct(analyticsEvents.sessionId) })
          .from(analyticsEvents)
          .where(
            and(
              eq(analyticsEvents.eventType, 'export'),
              sql`${analyticsEvents.metadata}->>'page' = 'results'`,
              gte(analyticsEvents.createdAt, dateFilter)
            )
          )
      : db
          .select({ count: countDistinct(analyticsEvents.sessionId) })
          .from(analyticsEvents)
          .where(
            and(
              eq(analyticsEvents.eventType, 'export'),
              sql`${analyticsEvents.metadata}->>'page' = 'results'`
            )
          );

    const actionPlanExportSessionsQuery = dateFilter
      ? db
          .select({ count: countDistinct(analyticsEvents.sessionId) })
          .from(analyticsEvents)
          .where(
            and(
              eq(analyticsEvents.eventType, 'export'),
              sql`${analyticsEvents.metadata}->>'page' = 'action-plan'`,
              gte(analyticsEvents.createdAt, dateFilter)
            )
          )
      : db
          .select({ count: countDistinct(analyticsEvents.sessionId) })
          .from(analyticsEvents)
          .where(
            and(
              eq(analyticsEvents.eventType, 'export'),
              sql`${analyticsEvents.metadata}->>'page' = 'action-plan'`
            )
          );

    const [resultsExportSessionsResult, actionPlanExportSessionsResult] = await Promise.all([
      resultsExportSessionsQuery,
      actionPlanExportSessionsQuery,
    ]);

    const sessionsWithResultsExport = resultsExportSessionsResult[0]?.count ?? 0;
    const sessionsWithActionPlanExport = actionPlanExportSessionsResult[0]?.count ?? 0;

    // -------------------------------------------------------------------------
    // Query 3: Distinct sessions with any export
    // -------------------------------------------------------------------------
    const distinctExportSessionsQuery = dateFilter
      ? db
          .select({ count: countDistinct(analyticsEvents.sessionId) })
          .from(analyticsEvents)
          .where(
            and(
              eq(analyticsEvents.eventType, 'export'),
              gte(analyticsEvents.createdAt, dateFilter)
            )
          )
      : db
          .select({ count: countDistinct(analyticsEvents.sessionId) })
          .from(analyticsEvents)
          .where(eq(analyticsEvents.eventType, 'export'));

    const distinctExportSessions = await distinctExportSessionsQuery;
    const sessionsWithExport = distinctExportSessions[0]?.count ?? 0;

    // -------------------------------------------------------------------------
    // Query 4: Assessment session counts
    // -------------------------------------------------------------------------
    // Total sessions (with responses = completed questionnaire)
    const totalSessionsQuery = dateFilter
      ? db
          .select({ count: count() })
          .from(assessmentSessions)
          .where(
            and(
              isNotNull(assessmentSessions.responses),
              gte(assessmentSessions.createdAt, dateFilter)
            )
          )
      : db
          .select({ count: count() })
          .from(assessmentSessions)
          .where(isNotNull(assessmentSessions.responses));

    const totalSessionsResult = await totalSessionsQuery;
    const completedQuestionnaires = totalSessionsResult[0]?.count ?? 0;

    // Sessions with purpose paths (reached results)
    const sessionsWithPathsQuery = dateFilter
      ? db
          .select({ count: countDistinct(purposePaths.assessmentId) })
          .from(purposePaths)
          .innerJoin(
            assessmentSessions,
            eq(purposePaths.assessmentId, assessmentSessions.id)
          )
          .where(gte(assessmentSessions.createdAt, dateFilter))
      : db
          .select({ count: countDistinct(purposePaths.assessmentId) })
          .from(purposePaths);

    const sessionsWithPathsResult = await sessionsWithPathsQuery;
    const sessionsWithPaths = sessionsWithPathsResult[0]?.count ?? 0;

    // Sessions with action plan
    const sessionsWithActionPlanQuery = dateFilter
      ? db
          .select({ count: count() })
          .from(assessmentSessions)
          .where(
            and(
              isNotNull(assessmentSessions.actionPlan),
              gte(assessmentSessions.createdAt, dateFilter)
            )
          )
      : db
          .select({ count: count() })
          .from(assessmentSessions)
          .where(isNotNull(assessmentSessions.actionPlan));

    const sessionsWithActionPlanResult = await sessionsWithActionPlanQuery;
    const sessionsWithActionPlan = sessionsWithActionPlanResult[0]?.count ?? 0;

    // -------------------------------------------------------------------------
    // Query 5: Section drop-off analysis
    // -------------------------------------------------------------------------
    // Get last section for each session that didn't complete (no purpose paths)
    const sectionDropoffQuery = db.execute(sql`
      WITH session_sections AS (
        SELECT
          ae.session_id,
          ae.metadata->>'section' as last_section,
          ROW_NUMBER() OVER (PARTITION BY ae.session_id ORDER BY ae.created_at DESC) as rn
        FROM analytics_events ae
        WHERE ae.event_type = 'section'
          ${dateFilter ? sql`AND ae.created_at >= ${dateFilter}` : sql``}
      ),
      sessions_without_results AS (
        SELECT DISTINCT ae.session_id
        FROM analytics_events ae
        WHERE ae.event_type = 'start'
          ${dateFilter ? sql`AND ae.created_at >= ${dateFilter}` : sql``}
          AND ae.session_id NOT IN (
            SELECT DISTINCT session_id FROM assessment_sessions WHERE responses IS NOT NULL
          )
      )
      SELECT
        ss.last_section,
        COUNT(*) as count
      FROM session_sections ss
      INNER JOIN sessions_without_results swr ON ss.session_id = swr.session_id
      WHERE ss.rn = 1
      GROUP BY ss.last_section
      ORDER BY count DESC
    `);

    const sectionDropoff = await sectionDropoffQuery;

    // -------------------------------------------------------------------------
    // Calculate and Display Metrics
    // -------------------------------------------------------------------------

    console.log('\n  FUNNEL METRICS');
    console.log('  ' + '-'.repeat(66));

    formatMetric(
      'Landing → Start',
      formatPercentage(startEvents / visitEvents),
      `${startEvents} starts / ${visitEvents} visits`
    );

    formatMetric(
      'Completion Rate',
      formatPercentage(completedQuestionnaires / startEvents),
      `${completedQuestionnaires} completed / ${startEvents} starts`
    );

    formatMetric(
      'Results → Action Plan',
      formatPercentage(sessionsWithActionPlan / sessionsWithPaths),
      `${sessionsWithActionPlan} action plans / ${sessionsWithPaths} results`
    );

    console.log('\n  EXPORT METRICS (% of sessions that exported at least once)');
    console.log('  ' + '-'.repeat(66));

    formatMetric(
      'Results Export Rate',
      formatPercentage(sessionsWithResultsExport / sessionsWithPaths),
      `${sessionsWithResultsExport} sessions / ${sessionsWithPaths} results`
    );

    formatMetric(
      'Action Plan Export Rate',
      formatPercentage(sessionsWithActionPlanExport / sessionsWithActionPlan),
      `${sessionsWithActionPlanExport} sessions / ${sessionsWithActionPlan} action plans`
    );

    formatMetric(
      'Overall Export Rate (North Star)',
      formatPercentage(sessionsWithExport / sessionsWithPaths),
      `${sessionsWithExport} sessions / ${sessionsWithPaths} results`
    );

    console.log('\n  RETENTION METRICS');
    console.log('  ' + '-'.repeat(66));

    formatMetric(
      'Restart Rate',
      formatPercentage(startOverEvents / sessionsWithPaths),
      `${startOverEvents} restarts / ${sessionsWithPaths} results`
    );

    console.log('\n  SECTION DROP-OFF (sessions that started but didn\'t complete)');
    console.log('  ' + '-'.repeat(66));

    if (sectionDropoff.rows && sectionDropoff.rows.length > 0) {
      for (const row of sectionDropoff.rows) {
        const section = (row as { last_section: string | null }).last_section ?? 'before any section';
        const dropCount = (row as { count: number | string }).count;
        console.log(`    Last completed: ${section.padEnd(20)} ${String(dropCount).padStart(5)} sessions`);
      }
    } else {
      console.log('    No drop-off data available');
    }

    console.log('\n  RAW COUNTS');
    console.log('  ' + '-'.repeat(66));
    console.log(`    Visit events:          ${visitEvents}`);
    console.log(`    Start events:          ${startEvents}`);
    console.log(`    Section events:        ${sectionEvents}`);
    console.log(`    Export events:         ${exportEvents}`);
    console.log(`    Start Over events:     ${startOverEvents}`);
    console.log(`    Completed sessions:    ${completedQuestionnaires}`);
    console.log(`    Sessions with results: ${sessionsWithPaths}`);
    console.log(`    Sessions with action:  ${sessionsWithActionPlan}`);

    console.log('\n' + '='.repeat(70) + '\n');

  } finally {
    await pool.end();
  }
}

// Run the report
generateReport().catch((error) => {
  console.error('\n' + '='.repeat(70));
  console.error(' ERROR GENERATING REPORT');
  console.error('='.repeat(70));
  console.error('\nError:', error instanceof Error ? error.message : error);

  if (error instanceof Error && error.stack) {
    console.error('\nStack trace:', error.stack);
  }

  console.error('\nTroubleshooting:');
  console.error('  1. Verify DATABASE_URL is correct and accessible');
  console.error('  2. Ensure database schema is up to date: npm run db:push');
  console.error('  3. Check network connectivity to the database');
  console.error('  4. Verify the database contains the analytics_events table');
  console.error('');
  process.exit(1);
});
