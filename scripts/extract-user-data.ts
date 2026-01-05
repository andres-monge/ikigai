/**
 * @description
 * User data extraction script for AI analysis of the Ikigai Finder application.
 *
 * Extracts questionnaire answers and session metadata in a format suitable for
 * AI-powered user persona analysis. The output is anonymized (session IDs are
 * already anonymous UUIDs) and formatted for consumption by AI analysis tools.
 *
 * Output includes:
 * - Session metadata (language, timestamps)
 * - Questionnaire responses (passions, skills, values, economic)
 * - Funnel progression (reached results, reached action plan)
 * - Export behavior (whether user exported, and from which page)
 *
 * @usage
 * DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/extract-user-data.ts > user-data.json
 * DATABASE_URL="$DEV_DATABASE_URL" npx tsx scripts/extract-user-data.ts --days=7 > user-data.json
 * DATABASE_URL="$DEV_DATABASE_URL" npx tsx scripts/extract-user-data.ts --days=30 > user-data.json
 */

import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { eq, gte, isNotNull, and, inArray } from 'drizzle-orm';
import ws from 'ws';
import * as schema from '../shared/schema.js';

const { analyticsEvents, assessmentSessions, purposePaths } = schema;

// Configure WebSocket for Node.js environments
neonConfig.webSocketConstructor = ws;

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface ExportInfo {
  hasExported: boolean;
  exportedFromResults: boolean;
  exportedFromActionPlan: boolean;
}

interface ExtractedSession {
  sessionId: string;
  language: string;
  createdAt: string;
  responses: {
    passions: Array<{ question: string; answer: string }>;
    skills: Array<{ question: string; answer: string }>;
    values: Array<{ question: string; answer: string }>;
    economic: Array<{ question: string; answer: string }>;
  };
  reachedResults: boolean;
  reachedActionPlan: boolean;
  hasExported: boolean;
  exportedFromResults: boolean;
  exportedFromActionPlan: boolean;
}

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
      console.error('Usage: npx tsx scripts/extract-user-data.ts [--days=N] > output.json');
      console.error('');
      console.error('Extracts user questionnaire data for AI analysis.');
      console.error('Output is JSON format, suitable for piping to a file.');
      console.error('');
      console.error('Options:');
      console.error('  --days=N    Filter to last N days (default: all time)');
      console.error('  --help, -h  Show this help message');
      console.error('');
      console.error('Environment:');
      console.error('  DATABASE_URL  Required. PostgreSQL connection string.');
      console.error('');
      console.error('Example:');
      console.error('  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/extract-user-data.ts > user-data.json');
      process.exit(0);
    } else {
      console.error(`Error: Unknown argument: ${arg}`);
      console.error('Usage: npx tsx scripts/extract-user-data.ts [--days=N] > output.json');
      console.error('Run with --help for more information.');
      process.exit(1);
    }
  }

  return { days };
}

/* -------------------------------------------------------------------------- */
/* Main Extraction Function                                                    */
/* -------------------------------------------------------------------------- */

async function extractUserData(): Promise<void> {
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

  // Calculate date filter if specified
  const dateFilter = days
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    : null;

  try {
    // -------------------------------------------------------------------------
    // Query 1: Get all completed sessions with their purpose paths
    // -------------------------------------------------------------------------
    const sessionsQuery = dateFilter
      ? db.query.assessmentSessions.findMany({
          where: and(
            isNotNull(assessmentSessions.responses),
            gte(assessmentSessions.createdAt, dateFilter)
          ),
          with: { purposePaths: true },
        })
      : db.query.assessmentSessions.findMany({
          where: isNotNull(assessmentSessions.responses),
          with: { purposePaths: true },
        });

    const sessions = await sessionsQuery;

    if (sessions.length === 0) {
      // Output empty array as valid JSON
      console.log(JSON.stringify([], null, 2));
      await pool.end();
      return;
    }

    // -------------------------------------------------------------------------
    // Query 2: Get export events for these sessions
    // -------------------------------------------------------------------------
    const sessionIds = sessions.map((s) => s.sessionId);

    const exportEventsQuery = db
      .select({
        sessionId: analyticsEvents.sessionId,
        metadata: analyticsEvents.metadata,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, 'export'),
          inArray(analyticsEvents.sessionId, sessionIds)
        )
      );

    const exportEvents = await exportEventsQuery;

    // Build a map of sessionId -> export info
    const exportInfoMap = new Map<string, ExportInfo>();

    for (const event of exportEvents) {
      const info = exportInfoMap.get(event.sessionId) ?? {
        hasExported: false,
        exportedFromResults: false,
        exportedFromActionPlan: false,
      };

      info.hasExported = true;

      const metadata = event.metadata as Record<string, unknown> | null;
      if (metadata?.page === 'results') {
        info.exportedFromResults = true;
      }
      if (metadata?.page === 'action-plan') {
        info.exportedFromActionPlan = true;
      }

      exportInfoMap.set(event.sessionId, info);
    }

    // -------------------------------------------------------------------------
    // Transform sessions to output format
    // -------------------------------------------------------------------------
    const extractedSessions: ExtractedSession[] = sessions.map((session) => {
      const responses = session.responses as schema.QuestionnaireResponses | null;
      const exportInfo = exportInfoMap.get(session.sessionId) ?? {
        hasExported: false,
        exportedFromResults: false,
        exportedFromActionPlan: false,
      };

      return {
        sessionId: session.sessionId,
        language: session.language,
        createdAt: session.createdAt.toISOString(),
        responses: {
          passions: responses?.passions ?? [],
          skills: responses?.skills ?? [],
          values: responses?.values ?? [],
          economic: responses?.economic ?? [],
        },
        reachedResults: session.purposePaths.length > 0,
        reachedActionPlan: session.actionPlan !== null,
        hasExported: exportInfo.hasExported,
        exportedFromResults: exportInfo.exportedFromResults,
        exportedFromActionPlan: exportInfo.exportedFromActionPlan,
      };
    });

    // -------------------------------------------------------------------------
    // Output as JSON to stdout
    // -------------------------------------------------------------------------
    console.log(JSON.stringify(extractedSessions, null, 2));

  } finally {
    await pool.end();
  }
}

// Run the extraction
extractUserData().catch((error) => {
  console.error('Error extracting user data:', error instanceof Error ? error.message : error);

  if (error instanceof Error && error.stack) {
    console.error('\nStack trace:', error.stack);
  }

  console.error('\nTroubleshooting:');
  console.error('  1. Verify DATABASE_URL is correct and accessible');
  console.error('  2. Ensure database schema is up to date: npm run db:push');
  console.error('  3. Check network connectivity to the database');
  console.error('');
  process.exit(1);
});
