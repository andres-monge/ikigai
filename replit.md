# Purpose Finder - Replit Development Guide

## Overview

Purpose Finder is an AI-powered web application that helps career-switchers and students discover their *ikigai* (reason for being) through a comprehensive questionnaire and AI analysis. The app provides personalized career path recommendations with detailed action plans, built with modern web technologies and deployed on Replit.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: React Query (TanStack) for server state, React hooks for local state
- **UI Framework**: Tailwind CSS with Shadcn/ui components
- **Styling**: CSS variables with dark mode support, custom gradient utilities
- **Build Tool**: Vite with hot module replacement

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Pattern**: RESTful endpoints under `/api` prefix
- **AI Integration**: Google Gemini API with custom wrapper and function calling
- **Session Management**: In-memory storage with anonymous session IDs
- **Database**: Drizzle ORM configured for PostgreSQL (currently using in-memory storage)

### Key Design Decisions
- **Single Page Application**: Eliminates page transitions for smoother UX
- **Anonymous Sessions**: No user accounts required, session data stored temporarily
- **Bilingual Support**: Full i18n for English and Spanish from day one
- **AI Chain Architecture**: Separated reasoning model (analysis) from facts model (search)

## Key Components

### Frontend Components
1. **SinglePageQuestionnaire**: All 8 questions on one page with auto-sizing textareas
3. **LoadingOverlay**: Full-screen loading states during AI processing
4. **Results Components**: Core drivers summary and purpose path selection
5. **ActionPlan**: Detailed step-by-step guidance with YouTube video integration

### Backend Modules
1. **AI Chains**: Modular AI processing pipelines
   - Purpose Discovery Chain: Generates core drivers and 3 purpose paths
   - Action Plan Chain: Creates detailed implementation steps
2. **Storage Layer**: Abstract interface with in-memory implementation
3. **Cache System**: TTL-based caching for salary data and YouTube videos

### AI Integration Strategy
- **Two-Call Chain**: Specialized models for research (facts) vs. analysis (reasoning)
- **Function Calling**: Structured tool use for salary lookup and YouTube search
- **Prompt Engineering**: Separate prompt templates for different AI tasks
- **Error Handling**: Exponential backoff retry logic for API reliability

## Data Flow

### User Journey Flow
1. **Landing**: User sees questionnaire directly on home page
2. **Assessment**: 8 questions submitted as single payload to `/api/analyze`
3. **AI Processing**: Backend runs purpose discovery chain with salary research
4. **Results**: User reviews 3 purpose paths with salary benchmarks
5. **Path Selection**: User chooses path, triggers action plan generation
6. **Action Plan**: Detailed implementation steps with YouTube resources

### Data Storage Pattern
- **Session Storage**: Client-side persistence of assessment results
- **Memory Storage**: Server-side temporary session management
- **Cache Layer**: TTL-based caching for external API responses

### AI Processing Pipeline
1. **Questionnaire Parsing**: Convert user responses to structured format
2. **Salary Research**: Use search-enabled model for current market data
3. **Purpose Analysis**: Apply reasoning model to generate insights
4. **Action Planning**: Create detailed implementation steps
5. **YouTube Integration**: Fetch relevant tutorial videos for skills

## External Dependencies

### AI Services
- **Google Gemini API**: Primary reasoning and search capabilities
- **Model Configuration**: Separate reasoning and facts models
- **Function Calling**: Structured tool integration for external data

### Third-Party APIs
- **YouTube Data API v3**: Educational video recommendations

### Development Tools
- **Drizzle Kit**: Database migrations and schema management
- **Vitest**: Testing framework with UI runner
- **PostCSS**: CSS processing with Tailwind

### UI Libraries
- **Radix UI**: Headless component primitives
- **Lucide React**: Icon library
- **React Textarea Autosize**: Auto-expanding text inputs
- **jsPDF**: Client-side PDF export

## Deployment Strategy

### Replit Configuration
- **Environment**: Node.js with ES modules
- **Development**: Vite dev server with HMR
- **Production**: Bundled Express server serving static files
- **Build Process**: Parallel frontend (Vite) and backend (esbuild) compilation

### Environment Variables
- `GEMINI_API_KEY`: Google AI authentication
- `GEMINI_REASONING_MODEL`: Primary analysis model
- `YOUTUBE_API_KEY`: Video recommendations
- `DATABASE_URL`: PostgreSQL connection (future migration)

### File Structure
```
├── client/          # React SPA
├── server/          # Express API
├── shared/          # Common types and schemas
├── migrations/      # Database migrations
└── dist/           # Production build output
```

### Development Workflow
- **Hot Reloading**: Vite handles frontend changes
- **API Restart**: Manual restart required for backend changes
- **Testing**: Vitest with mocked external services
- **Type Safety**: Shared TypeScript types across frontend/backend

### Scaling Considerations
- **Database Migration**: Ready for PostgreSQL with Drizzle ORM
- **Caching**: Redis-ready cache interface for production
- **Session Management**: Prepared for persistent user accounts
- **Rate Limiting**: Consider implementing for AI API protection
