# Technical Context: AI Companion Call System
## Env varibles and context
- **this application is being hosted on Replit and we are connected to replit for coding.**
-- this means that we always have a Dev Preview running.
- **Our env varibles are also being hosted on replit and contatin the following.**
-- SESSION_SECRET
-- DATABASE_URL
-- PGDATABASE
-- PGHOST
-- PGPORT
-- PGUSER
-- PGPASSWORD
-- VAPI_PUBLIC_KEY
-- VAPI_PRIVATE_KEY
-- OPENAI_API_KEY
## Technology Stack

### Frontend Technologies
- **React 18.3.1**: Modern React with hooks and functional components
- **TypeScript 5.6.3**: Full type safety across the application
- **Vite 5.4.14**: Fast build tool and development server
- **TailwindCSS 3.4.14**: Utility-first CSS framework
- **shadcn/ui**: High-quality React component library
- **React Query (@tanstack/react-query 5.60.5)**: Server state management
- **React Hook Form 7.53.1**: Form handling with validation
- **Wouter 3.3.5**: Lightweight routing library
- **Lucide React**: Icon library

### Backend Technologies
- **Node.js**: JavaScript runtime environment
- **Express 4.21.2**: Web application framework
- **TypeScript**: Type-safe server-side development
- **Drizzle ORM 0.39.3**: Type-safe database ORM
- **PostgreSQL**: Primary database (via @neondatabase/serverless)
- **Express Session 1.18.1**: Session management
- **Passport 0.7.0**: Authentication middleware
- **Multer 1.4.5**: File upload handling

### External Services & APIs
- **Vapi AI**: Voice AI platform for automated calls
  - Assistant ID: (CalicoCareAgent)
  - Phone Number ID:
  - API Base: `https://api.vapi.ai`
- **OpenAI**:
  - GPT-5-Mini: Default for AI Triage prompt generation and Trend Reports
  - GPT-4o-mini: Conversation summarization
- **Twilio 5.5.2**: SMS notifications and alerts
- **WebSocket (ws 8.18.0)**: Real-time communication

### Development Tools
- **ESBuild 0.25.0**: Fast JavaScript bundler
- **TSX 4.19.1**: TypeScript execution for development
- **Drizzle Kit 0.30.4**: Database migration and introspection
- **PostCSS 8.4.47**: CSS processing
- **Autoprefixer 10.4.20**: CSS vendor prefixing

## Development Setup

### Environment Configuration
```bash
# Required Environment Variables
DATABASE_URL=postgresql://...
VAPI_PRIVATE_KEY=sk_...
VAPI_PUBLIC_KEY=pk_...
VAPI_PHONE_NUMBER_ID=f412bd32-9764-4d70-94e7-90f87f84ef08
OPENAI_API_KEY=sk-...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
```

### Project Structure
```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable UI components
│   │   ├── hooks/         # Custom React hooks
│   │   └── lib/           # Utility functions
│   └── index.html
├── server/                # Backend Express application
│   ├── routes/           # API route handlers
│   ├── services/         # Business logic services
│   ├── utils/            # Utility functions
│   ├── lib/              # Shared libraries
│   ├── storage.ts        # Database abstraction layer
│   ├── auth.ts           # Authentication logic
│   └── index.ts          # Server entry point
├── shared/               # Shared types and schemas
│   ├── schema.ts         # Database schema definitions
│   └── types.ts          # TypeScript type definitions
├── drizzle/              # Database migrations
├── memory-bank/          # Project documentation
└── package.json          # Dependencies and scripts
```

### Build Scripts
```json
{
  "dev": "tsx server/index.ts",
  "build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
  "start": "NODE_ENV=production node dist/index.js",
  "check": "tsc",
  "db:push": "drizzle-kit push"
}
```

## Technical Constraints

### Vapi AI Limitations
- **Daily Call Limits**: Free tier has limited outbound calls per day
- **Phone Number Restrictions**: Limited to provided phone numbers
- **Webhook Requirements**: Must handle webhook callbacks for call completion
- **Assistant Configuration**: Fixed assistant ID with variable-based customization

### Database Constraints
- **PostgreSQL**: Requires PostgreSQL-compatible database
- **Connection Limits**: Managed through connection pooling
- **Schema Migrations**: Version-controlled through Drizzle Kit
- **Data Types**: JSONB for complex data structures, arrays for lists

### API Rate Limits
- **OpenAI**: Token-based pricing, optimize prompt length
- **Twilio**: SMS rate limits and costs
- **Vapi**: Call volume restrictions on free tier

### Security Requirements
- **Healthcare Data**: HIPAA compliance considerations
- **API Keys**: Secure environment variable management
- **Session Security**: Secure session storage and management
- **Data Encryption**: Encrypted database connections

## Dependencies Analysis

### Critical Dependencies
```json
{
  "openai": "^4.103.0",           // AI text processing
  "twilio": "^5.5.2",             // SMS notifications
  "drizzle-orm": "^0.39.3",       // Database ORM
  "express": "^4.21.2",           // Web framework
  "react": "^18.3.1",             // Frontend framework
  "@tanstack/react-query": "^5.60.5" // State management
}
```

### Development Dependencies
```json
{
  "typescript": "5.6.3",          // Type safety
  "vite": "^5.4.14",              // Build tool
  "tailwindcss": "^3.4.14",       // CSS framework
  "drizzle-kit": "^0.30.4",       // Database tools
  "esbuild": "^0.25.0"            // JavaScript bundler
}
```

## Tool Usage Patterns

### Database Operations
```typescript
// Drizzle ORM pattern
import { db } from "./db";
import { callHistory, eq } from "@shared/schema";

// Type-safe queries
const calls = await db.select()
  .from(callHistory)
  .where(eq(callHistory.patientId, patientId));
```

### API Client Pattern
```typescript
// Centralized API client
export async function apiRequest(
  method: string,
  endpoint: string,
  data?: any
): Promise<Response> {
  return fetch(endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include"
  });
}
```

### React Query Integration
```typescript
// Server state management
const { data, isLoading, error } = useQuery({
  queryKey: ["/api/call-history"],
  queryFn: async () => {
    const response = await apiRequest("GET", "/api/call-history");
    if (!response.ok) throw new Error("Failed to fetch");
    return response.json();
  }
});
```

## Integration Specifications

### Vapi AI Integration
```typescript
// Call initiation
const callRequest = {
  phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
  customer: { number: formattedPhoneNumber },
  assistantId: "d289d8be-be92-444e-bb94-b4d25b601f82",
  assistantOverrides: {
    variableValues: {
      patientName: string,
      patientAge: number,
      patientCondition: string,
      patientPrompt: string,
      conversationHistory: string
    }
  },
  metadata: {
    patientId: string,
    patientName: string,
    callType: string
  }
};
```

### Webhook Processing
```typescript
// Webhook endpoint structure
app.post("/api/vapi/webhook", async (req, res) => {
  const { message } = req.body;
  
  if (message.type === "end-of-call-report") {
    const { call, transcript, summary } = message;
    // Process call completion data
  }
  
  res.status(200).json({ success: true });
});
```

### OpenAI Integration
```typescript
// AI summarization
const response = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    {
      role: "system",
      content: "Healthcare assistant analyzing patient calls"
    },
    {
      role: "user",
      content: prompt
    }
  ],
  response_format: { type: "json_object" },
  temperature: 0.3
});
```

## Performance Optimizations

### Frontend Optimizations
- **Code Splitting**: Lazy loading of page components
- **React Query Caching**: Intelligent server state caching
- **Optimistic Updates**: Immediate UI feedback
- **Bundle Optimization**: Vite's automatic code splitting

### Backend Optimizations
- **Database Indexing**: Optimized queries for call history
- **Connection Pooling**: Efficient database connections
- **Middleware Caching**: Session and authentication caching
- **Error Handling**: Graceful error recovery

### API Optimizations
- **Batch Operations**: Bulk patient processing
- **Rate Limiting**: Respect external API limits
- **Retry Logic**: Automatic retry for failed requests
- **Webhook Reliability**: Idempotent webhook processing

## Deployment Considerations

### Environment Setup
- **Node.js Version**: Compatible with ES modules
- **Database**: PostgreSQL with SSL support
- **Environment Variables**: Secure secret management
- **Process Management**: PM2 or similar for production

### Monitoring Requirements
- **Call Success Rates**: Track Vapi call completion
- **API Response Times**: Monitor external service latency
- **Database Performance**: Query optimization monitoring
- **Error Tracking**: Comprehensive error logging

### Scaling Considerations
- **Database Scaling**: Read replicas for analytics
- **API Rate Management**: Queue system for high volume
- **Webhook Processing**: Async processing for webhooks
- **Frontend CDN**: Static asset optimization 