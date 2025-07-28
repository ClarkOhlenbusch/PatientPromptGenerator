# CalicoCare - AI Healthcare Monitoring System

## Overview

CalicoCare is a comprehensive healthcare monitoring platform that transforms patient medical data into actionable insights through AI-powered analysis and automated voice-based patient interactions. The system serves healthcare providers by automating patient outreach, monitoring health conditions, and generating detailed care recommendations.

## System Architecture

### Frontend Architecture
- **Framework**: React 18.3.1 with TypeScript for type safety
- **Build Tool**: Vite 5.4.14 for fast development and optimized builds
- **Styling**: TailwindCSS 3.4.14 with shadcn/ui component library
- **State Management**: React Query (@tanstack/react-query) for server state
- **Routing**: Wouter 3.3.5 for lightweight client-side routing
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express 4.21.2 framework
- **Language**: TypeScript for full-stack type safety
- **Database ORM**: Drizzle ORM 0.39.3 with PostgreSQL
- **Authentication**: Passport.js with express-session
- **File Processing**: ExcelJS for patient data uploads
- **PDF Generation**: pdfmake for reporting

### Database Design
- **Primary Database**: PostgreSQL via @neondatabase/serverless
- **Schema Management**: Drizzle migrations with version control
- **Session Storage**: connect-pg-simple for secure session persistence
- **Key Tables**: users, patient_batches, patient_prompts, call_history, system_settings

## Key Components

### Patient Data Management
- **Excel Upload Processing**: Automated CSV/Excel file parsing and validation
- **Batch Management**: Organized processing of patient groups with unique batch IDs
- **Data Normalization**: Intelligent mapping of patient variables and health conditions
- **Triage Assessment**: AI-powered analysis to identify patients requiring immediate attention

### Voice AI Integration (VAPI)
- **Unified Call System**: Single context-aware calling endpoint for all patient interactions
- **Template-Based Prompts**: Customizable voice agent templates with variable injection
- **Real-time Context**: Patient health data automatically injected into each call
- **Call History Integration**: Previous conversation summaries included for continuity
- **Webhook Processing**: Automated handling of call completion data and analytics

### AI-Powered Analytics
- **OpenAI Integration**: GPT-4o-mini for intelligent text analysis and summarization
- **Conversation Analysis**: Automated extraction of key health concerns and follow-up items
- **Personalized Recommendations**: Context-aware care suggestions based on patient data
- **Trend Reporting**: AI-generated monthly health trend analysis

### Alert and Notification System
- **SMS Alerts**: Twilio integration for critical patient notifications
- **Triage Monitoring**: Automated identification of high-risk patients
- **Healthcare Provider Notifications**: Real-time alerts for urgent interventions
- **Escalation Workflows**: Configurable alert routing and follow-up procedures

## Data Flow

### Patient Onboarding Flow
1. Healthcare provider uploads Excel file with patient data
2. System processes and normalizes patient information
3. AI generates personalized care prompts for each patient
4. Batch processing creates triage assessments
5. Patients become available for voice outreach campaigns

### Voice Call Flow
1. Provider selects patients for outreach
2. System retrieves patient context and call history
3. Voice agent template enhanced with patient-specific data
4. VAPI initiates call with comprehensive patient context
5. Real-time call monitoring and status updates
6. Automated post-call processing and analytics storage

### Alert Processing Flow
1. Continuous monitoring of patient triage assessments
2. AI identifies patients requiring immediate attention
3. Alert notifications sent via SMS to healthcare providers
4. Provider action tracking and response coordination
5. Follow-up workflow management and documentation

## External Dependencies

### Core Services
- **VAPI AI Voice Platform**: Voice agent orchestration and call management
- **OpenAI API**: GPT-4o-mini for text analysis and conversation summarization
- **Twilio**: SMS messaging for healthcare alerts and notifications
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling

### Development Tools
- **ESBuild**: Fast JavaScript bundling for production builds
- **TSX**: TypeScript execution for development server
- **Drizzle Kit**: Database migration and schema management

### Authentication and Security
- **Express Sessions**: Secure session management with PostgreSQL storage
- **Passport.js**: Local authentication strategy with password hashing
- **CORS**: Cross-origin resource sharing with credential support

## Deployment Strategy

### Replit Hosting
- **Environment**: Replit autoscale deployment target
- **Build Process**: `npm ci && npm run build` with automatic dependency installation
- **Runtime**: Node.js 20 with PostgreSQL 16 module support
- **Port Configuration**: Port 5000 for API, port 3000 for development

### Environment Configuration
- **Required Variables**: DATABASE_URL, SESSION_SECRET, OPENAI_API_KEY
- **Optional Services**: VAPI_PRIVATE_KEY, TWILIO credentials for full functionality
- **Auto-scaling**: Configured for production workloads with health monitoring

### Database Initialization
- **Automatic Setup**: Database tables created on first run
- **Migration Support**: Version-controlled schema updates
- **Default User**: CalicoCare/CalicoCare admin account auto-created

Changelog:
```
Changelog:
- June 25, 2025. Initial setup
```

User Preferences:
```
Preferred communication style: Simple, everyday language.
```