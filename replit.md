# Purpose Finder Application - Architecture Guide

## Overview

The Purpose Finder is a full-stack web application that helps users discover their "ikigai" (life purpose) through an AI-powered career assessment. Users complete a questionnaire about their passions, skills, values, and economic considerations, then receive personalized career path recommendations with salary data and can refine results through an AI chat interface.

## System Architecture

### Full-Stack Structure
- **Frontend**: React 18 SPA with TypeScript, built with Vite
- **Backend**: Express.js server with TypeScript (ESM modules)
- **Database**: PostgreSQL with Drizzle ORM (configurable)
- **AI Integration**: Google Gemini API for analysis and chat
- **Deployment**: Replit-optimized with autoscale deployment

### Technology Stack
- **Frontend**: React, TypeScript, Tailwind CSS, shadcn/ui components
- **Backend**: Express.js, TypeScript, Drizzle ORM
- **Database**: PostgreSQL (via Neon/serverless)
- **AI**: Google Gemini 2.5 Flash Preview
- **Build Tools**: Vite, esbuild
- **Testing**: Vitest

## Key Components

### Frontend Architecture
- **Component-based**: Uses React functional components with hooks
- **State Management**: Session storage for persistence, React Query for server state
- **UI Framework**: shadcn/ui components with Radix UI primitives
- **Styling**: Tailwind CSS with custom design system
- **Internationalization**: Built-in English/Spanish support

### Backend Architecture
- **Modular Router**: Feature-based route organization (`/api/analyze`, `/api/chat`)
- **Storage Abstraction**: Interface-based storage layer (currently in-memory, ready for PostgreSQL)
- **AI Integration**: Centralized wrapper for Gemini API with retry logic and error handling
- **Caching Layer**: In-memory TTL cache for expensive operations (salary data, search results)

### Database Schema
The application uses Drizzle ORM with PostgreSQL-compatible schema:
- **assessment_sessions**: User sessions with questionnaire responses and analysis
- **purpose_paths**: Generated career recommendations with ikigai alignment
- **salary_data**: Cached salary benchmarks for different roles
- **chat_messages**: Conversation history for AI refinement

## Data Flow

### Assessment Flow
1. User completes 8-question assessment (2 per category: passions, skills, values, economic)
2. Frontend sends structured questionnaire responses to `/api/analyze`
3. Backend orchestrates two-stage AI analysis:
   - Stage 1: Extract core drivers from responses
   - Stage 2: Generate 3 purpose paths with detailed analysis
4. System enriches paths with salary data via external APIs
5. Complete results returned and cached in session storage

### Chat Refinement Flow
1. User initiates chat from results page
2. Frontend establishes Server-Sent Events connection to `/api/chat`
3. Backend streams AI responses in real-time using async generators
4. Chat history persisted for context in subsequent conversations
5. AI has access to full assessment context for personalized responses

## External Dependencies

### AI Services
- **Google Gemini API**: Primary AI provider for analysis and chat
- **Function Calling**: Used for structured data extraction
- **Streaming**: Real-time chat responses via Server-Sent Events

### Data Sources
- **Salary APIs**: External salary benchmarking (cached for performance)
- **YouTube API**: Learning resource recommendations (cached)

### Development Tools
- **Replit**: Primary development and deployment environment
- **Vite**: Frontend build tool with HMR support
- **ESBuild**: Backend bundling for production

## Deployment Strategy

### Development Environment
- Runs on Replit with PostgreSQL module enabled
- Vite dev server for frontend with HMR
- Express server with TypeScript compilation via tsx
- Concurrent development on port 5000

### Production Build
- Frontend: Vite build to `dist/public`
- Backend: ESBuild bundle to `dist/index.js`
- Environment: Node.js with external package resolution
- Database: Requires `DATABASE_URL` environment variable

### Environment Configuration
- **Development**: `NODE_ENV=development`, database auto-provisioned
- **Production**: `NODE_ENV=production`, optimized builds
- **API Keys**: Gemini API key required via environment variables

## Changelog

- June 26, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.