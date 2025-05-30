# System Patterns: AI Companion Call System

## Architecture Overview

### High-Level System Design
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   External      │
│   (React)       │◄──►│   (Express)     │◄──►│   Services      │
│                 │    │                 │    │                 │
│ • Patient Mgmt  │    │ • API Routes    │    │ • Vapi AI       │
│ • Call Config   │    │ • Storage Layer │    │ • OpenAI        │
│ • Call History  │    │ • Auth System   │    │ • Twilio        │
│ • Analytics     │    │ • Webhooks      │    │ • PostgreSQL    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Core Components

#### 1. Frontend Layer (React + TypeScript)
- **Pages**: Modular page components for different workflows
  - `AICompanionCalls.tsx`: Call initiation and configuration
  - `CallHistory.tsx`: Call monitoring and analytics
  - `AIPoweredTriage.tsx`: Patient triage and alerts
  - `PromptEditingSandbox.tsx`: AI prompt customization
- **State Management**: React Query for server state, local state for UI
- **UI Framework**: shadcn/ui components with TailwindCSS styling

#### 2. Backend Layer (Node.js + Express)
- **Route Structure**: Modular route handlers
  - `vapi.ts`: Vapi AI integration and webhook handling
  - `calls.ts`: Call history management
  - `upload.ts`: Patient data processing
  - `triage.ts`: Alert system and SMS notifications
- **Storage Layer**: Centralized data access through `storage.ts`
- **Authentication**: Express sessions with Passport.js

#### 3. Database Layer (PostgreSQL + Drizzle ORM)
- **Schema-First Design**: Type-safe database operations
- **Relational Structure**: Normalized tables with clear relationships
- **Migration Support**: Version-controlled schema changes

## Key Technical Decisions

### 1. Vapi AI Integration Pattern
```typescript
// Centralized Vapi configuration
const VAPI_CONFIG = {
  assistantId: "d289d8be-be92-444e-bb94-b4d25b601f82", // CalicoCareAgent
  phoneNumberId: "f412bd32-9764-4d70-94e7-90f87f84ef08",
  baseUrl: "https://api.vapi.ai"
};

// Variable-based prompt system
const callRequest = {
  assistantId: VAPI_CONFIG.assistantId,
  assistantOverrides: {
    variableValues: {
      patientName: string,
      patientAge: number,
      patientCondition: string,
      patientPrompt: string,
      conversationHistory: string
    }
  }
};
```

### 2. Webhook Processing Pattern
```typescript
// Webhook handler for call completion
app.post("/api/vapi/webhook", async (req, res) => {
  const { message } = req.body;
  
  if (message.type === "end-of-call-report") {
    // 1. Extract call data
    // 2. Generate AI summary
    // 3. Store in database
    // 4. Trigger follow-up actions
  }
});
```

### 3. AI-Powered Summarization
```typescript
// OpenAI integration for call analysis
async function generateConversationSummary(transcript: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Healthcare assistant analyzing patient calls" },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" }
  });
  
  return {
    summary: string,
    keyPoints: string[],
    healthConcerns: string[],
    followUpItems: string[]
  };
}
```

## Design Patterns in Use

### 1. Repository Pattern (Storage Layer)
- **Centralized Data Access**: All database operations through `storage.ts`
- **Interface-Based Design**: `IStorage` interface for testability
- **Type Safety**: Full TypeScript integration with Drizzle ORM

### 2. API Route Organization
- **Feature-Based Routing**: Routes grouped by functionality
- **Middleware Pattern**: Authentication and validation middleware
- **Error Handling**: Consistent error response format

### 3. Frontend State Management
- **Server State**: React Query for API data caching and synchronization
- **Local State**: React hooks for component-specific state
- **Form Management**: React Hook Form with Zod validation

### 4. Configuration Management
- **Environment Variables**: Secure API key and database configuration
- **Type-Safe Config**: TypeScript interfaces for configuration objects
- **Default Values**: Fallback configurations for development

## Component Relationships

### Data Flow Architecture
```
CSV Upload → Patient Processing → AI Prompt Generation → Voice Call Initiation
     ↓              ↓                    ↓                      ↓
Patient Batch → Patient Prompts → Call Configuration → Vapi API Call
     ↓              ↓                    ↓                      ↓
Database → Triage Analysis → Call History → Webhook Processing
```

### API Integration Points
1. **Vapi AI Voice Agents**:
   - Call initiation via REST API
   - Webhook callbacks for call completion
   - Assistant configuration management

2. **OpenAI GPT-4o-mini**:
   - Patient prompt generation
   - Call transcript summarization
   - Health concern extraction

3. **Twilio SMS**:
   - Alert notifications
   - Emergency contact system

## Critical Implementation Paths

### 1. Call Initiation Flow
```typescript
// Frontend: User selects patient and configures call
// Backend: Format phone number, prepare Vapi request
// Vapi: Initiate voice call with AI assistant
// Database: Log call attempt
```

### 2. Webhook Processing Flow
```typescript
// Vapi: Send end-of-call-report webhook
// Backend: Receive webhook, extract transcript
// OpenAI: Generate conversation summary
// Database: Store call history with analysis
// Frontend: Update call history display
```

### 3. Patient Data Processing
```typescript
// Frontend: Upload CSV file
// Backend: Parse and validate patient data
// OpenAI: Generate personalized care prompts
// Database: Store patient records and prompts
// Frontend: Display processed patients
```

## Security Patterns

### 1. Authentication Flow
- **Session-Based Auth**: Express sessions with PostgreSQL store
- **Route Protection**: Middleware-based authentication checks
- **Password Security**: Bcrypt hashing for user passwords

### 2. API Security
- **Environment Variables**: Secure storage of API keys
- **Request Validation**: Zod schemas for input validation
- **Error Handling**: Sanitized error responses

### 3. Healthcare Compliance
- **Data Encryption**: Encrypted database connections
- **Audit Logging**: Call history and user action tracking
- **Access Control**: Role-based access to patient data

## Performance Considerations

### 1. Database Optimization
- **Indexed Queries**: Optimized queries for call history and patient lookup
- **Connection Pooling**: Efficient database connection management
- **Query Caching**: React Query for frontend data caching

### 2. API Rate Limiting
- **Vapi Limits**: Respect daily call limits for free tier
- **OpenAI Optimization**: Efficient prompt design for cost control
- **Batch Processing**: Bulk operations for patient data processing

### 3. Frontend Performance
- **Code Splitting**: Lazy loading of page components
- **Optimistic Updates**: Immediate UI feedback for user actions
- **Error Boundaries**: Graceful error handling and recovery 