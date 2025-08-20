# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm run dev` - Start development server (loads environment with `env-loader.cjs`)
- `npm run build` - Build both client and server for production
- `npm start` - Run production build
- `npm run check` - TypeScript type checking

### Database Management
- `npm run db:push` - Push schema changes to database using Drizzle Kit
- Environment setup requires `DATABASE_URL` in `.env` file

### Testing
- `npm test` - Run unit tests with Vitest
- `npm run test:ui` - Run tests with Vitest UI
- `npm run test:e2e` - Run Playwright end-to-end tests
- `npm run test:e2e:ui` - Run E2E tests with Playwright UI
- `npm run test:e2e:headed` - Run E2E tests in headed mode

## Project Architecture

### Application Overview
Ikigai Finder is an AI-powered career guidance application that helps users discover their purpose through a structured questionnaire. The app generates personalized career paths and detailed action plans using Google's Gemini AI models.

### High-Level Structure
- **Frontend**: React SPA with TypeScript, Vite, TanStack Query, shadcn/ui components
- **Backend**: Express.js server with AI orchestration chains
- **Database**: PostgreSQL with Drizzle ORM
- **AI Integration**: Dual Gemini model strategy (reasoning + facts with search)
- **Deployment**: Configured for Replit deployment

### Key Architectural Patterns

#### AI Chain System (`server/ai/chains/`)
The application uses a sophisticated AI orchestration system:
- `purpose-discovery.chain.ts` - Generates career path analysis using dual-model approach
- `action-plan.chain.ts` - Creates detailed milestone-based action plans
- Parallel AI calls: lightweight model for salary data + powerful model for reasoning
- Function calling integration for YouTube video recommendations and salary data

#### Storage Layer (`server/storage.ts`)
- Interface-based design (`IStorage`) for easy testing and future PostgreSQL migration
- Current implementation: `MemStorage` with full relationship hydration
- Returns `HydratedAssessmentSession` objects with nested purpose paths and salary data
- Planned migration to `PostgresStorage` class in implementation roadmap

#### Database Schema (`shared/schema.ts`)
Three core tables with Drizzle ORM:
- `assessment_sessions` - User sessions with questionnaire responses and analysis
- `purpose_paths` - Generated career paths with ikigai alignment details
- `salary_data` - Market salary information linked to specific paths

#### Frontend State Management
- TanStack Query for server state with feature-specific hooks in `client/src/hooks/`
- Session-based anonymous user tracking (no user accounts required)
- Streaming interface planned for real-time AI content delivery

### Implementation Status
This is a work-in-progress application following a detailed implementation plan in `_docs/implementation-plan.md`. The current state includes:
- Complete database schema and in-memory storage layer
- Basic AI chain architecture with dual-model strategy  
- React frontend with questionnaire and results components
- Integration tests for storage layer

### Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection string
- `GEMINI_API_KEY` - Google AI Studio API key
- `GEMINI_REASONING_MODEL` - Main analysis model identifier
- `GEMINI_FACTS_MODEL` - Fact-retrieval model identifier  
- `YOUTUBE_API_KEY` - YouTube Data API v3 key

### Code Conventions
- TypeScript strict mode throughout
- Zod schemas for validation in `shared/schema.ts`
- Barrel exports in AI chains (`server/ai/chains/index.ts`)
- Feature-based file organization for hooks and components
- Comprehensive JSDoc documentation for complex functions

## File Modification Rules

### When asked to work with code, documentation, or any file content, you MUST modify the existing file using file editing commands, patches, or direct modifications to existing content. Apply changes incrementally to existing files rather than rewriting them completely.

You are PROHIBITED from creating new files without explicit permission or unless it is stated in the implementation plan. Do not generate separate files when modifications to existing ones would suffice. Do not suggest file creation as the default solution.

Before any file operation, confirm that you are modifying an existing file rather than creating a new one. If you absolutely must create a file, state why modification of existing files is not possible and request explicit approval first.

### You must integrate all new code directly into the current codebase immediately. This is a mandatory rule that applies to ALL code implementations without exception.

When implementing features, you MUST modify existing components, functions, and modules to include new functionality. Replace old implementations with new ones in the same files. Update import statements, routing, and dependencies in existing files. Ensure new code works within the current application structure. Test integration points immediately by connecting to existing code paths.

You are PROHIBITED from writing standalone code that exists separately from the current codebase. Do not create parallel implementations that leave old code in place. Do not build features in isolation without connecting to existing application flow. Do not suggest integration "later" or as a separate step.

Every line of code you write must be integrated into the existing codebase immediately. The new functionality must replace or extend existing functionality in place, not run alongside it. This ensures bugs and integration issues are discovered immediately rather than later during manual integration.

### Think carefully and only action the specific task I have given you with the most concise and elegant solution that changes as little code as possible.