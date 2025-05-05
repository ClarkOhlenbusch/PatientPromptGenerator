Complete PatientPromptGenerator Codebase Documentation & Migration Guide

I. System Architecture Overview

PatientPromptGenerator is a fullstack healthcare communication platform built on:

- **Frontend**: React (TypeScript) with shadcn/ui components
- **Backend**: Node.js Express server
- **Database**: PostgreSQL using Drizzle ORM
- **AI**: OpenAI GPT-4o integration
- **Notifications**: Twilio SMS integration
- **Authentication**: Session-based authentication
- **Reporting**: PDF generation with pdfmake

II. Core Directory Structure

```
/
├── @shared/          # Shared code between frontend and backend
├── client/           # Frontend React application
├── drizzle/          # Database migrations
├── public/           # Static assets
├── server/           # Backend Express server
│   ├── lib/          # Backend utilities
│   └── routes.ts     # API endpoints
├── shared/           # Common type definitions

```

III. Database Schema (shared/schema.ts)

This file defines the entire data model using Drizzle ORM. Each table definition includes:

1. Table structure
2. Insert schemas (for validation)
3. TypeScript type definitions

Key Tables

1. **users**: Authentication and user management
    
    ```
    export const users = pgTable("users", {
      id: serial("id").primaryKey(),
      username: text("username").notNull(),
      password: text("password").notNull(),
      email: text("email"),
      createdAt: timestamp("created_at").defaultNow()
    });
    
    ```
    
2. **patient_batches**: Upload sessions of patient data
    
    ```
    export const patientBatches = pgTable("patient_batches", {
      id: serial("id").primaryKey(),
      batchId: text("batch_id").notNull().unique(),
      fileName: text("file_name"),
      totalPatients: integer("total_patients").default(0),
      processedPatients: integer("processed_patients").default(0),
      createdAt: timestamp("created_at").defaultNow(),
    });
    
    ```
    
3. **patient_prompts**: Generated patient care recommendations
    
    ```
    export const patientPrompts = pgTable("patient_prompts", {
      id: serial("id").primaryKey(),
      batchId: text("batch_id").notNull(),
      patientId: text("patient_id").notNull(),
      name: text("name"),
      age: integer("age"),
      condition: text("condition"),
      prompt: text("prompt").notNull(),
      reasoning: text("reasoning"),
      isAlert: text("is_alert"),
      healthStatus: text("health_status"),
      rawData: jsonb("raw_data"),
      createdAt: timestamp("created_at").defaultNow(),
      updatedAt: timestamp("updated_at").defaultNow(),
    });
    
    ```
    
4. **system_prompts**: AI system prompt templates
5. **template_variables**: Customizable placeholders for prompts
6. **system_settings**: Application configuration settings

IV. Backend Components In-Depth

1. Database Connection (server/db.ts)

```
// Configures Neon PostgreSQL connection with WebSocket support
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000
});

export const db = drizzle(pool, { schema });

```

This module:

- Configures the WebSocket constructor for Neon database
- Creates a connection pool with 10 max connections
- Sets up the Drizzle ORM with the schema definitions
- Exposes the database client for use in other modules

2. Storage Interface (server/storage.ts)

The key gateway between your application and database - defines all data operations:

```
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Patient Batch methods
  createPatientBatch(batch: InsertPatientBatch): Promise<PatientBatch>;
  getPatientBatch(batchId: string): Promise<PatientBatch | undefined>;
  getAllPatientBatches(): Promise<PatientBatch[]>;

  // Patient Prompt methods
  createPatientPrompt(prompt: InsertPatientPrompt): Promise<PatientPrompt>;
  getPatientPromptsByBatchId(batchId: string): Promise<PatientPrompt[]>;
  getPatientPromptByIds(batchId: string, patientId: string): Promise<PatientPrompt | undefined>;
  getPatientPromptById(id: number): Promise<PatientPrompt | undefined>;
  updatePatientPrompt(id: number, updates: Partial<InsertPatientPrompt>): Promise<PatientPrompt>;

  // System Prompt methods, Template methods, Triage methods, etc.
  // ...
}

```

The `DatabaseStorage` class implements this interface with PostgreSQL operations using Drizzle ORM. Each method:

1. Takes typed parameters corresponding to the schema
2. Performs database queries with proper error handling
3. Returns typed results

3. Authentication System (server/auth.ts)

Implements user authentication with Passport.js:

```
export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
  };

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Password hashing using scrypt
  // Local strategy for username/password
  // Session serialization/deserialization
  // Login/logout/register routes
}

```

Key features:

- Secure password hashing using scrypt with salt
- Session-based authentication
- Routes for login, logout, registration
- Session store persistence in PostgreSQL

4. OpenAI Integration (server/lib/openai.ts)

Core AI functionality for prompt generation:

```
export async function generatePrompt(
  patient: PatientData,
  batchId?: string,
  customSystemPrompt?: string
): Promise<string> {
  // Caching strategy
  // System prompt selection
  // OpenAI API call with retry logic
  // Token usage tracking
  // Response processing
  // Reasoning extraction
}

```

Key aspects:

- Caches identical prompts to reduce API costs
- Handles retriable API errors with exponential backoff
- Extracts reasoning section for UI display
- Estimates token usage and cost
- Formats patient data for optimal AI context

5. Excel Processing (server/lib/excelProcessor.ts)

Handles patient data ingestion from Excel files:

```
export async function processExcelFile(buffer: Buffer | ArrayBuffer): Promise<PatientData[]> {
  // State machine (S0-S8) for Excel processing
  // Header detection
  // Data validation and transformation
  // Patient aggregation and alert detection
}

```

This uses a state machine approach with states S0-S8 to process Excel files:

- S0: Initialize workbook
- S1: Identify header row
- S2: Parse column mappings
- S3: Extract patient records
- S4/S5: Process data rows
- S6: Aggregate patient data
- S7: Tag alerts
- S8: Return processed data

6. PDF Report Generation (server/lib/enhancedPdfGenerator.ts)

Creates clinical reports using pdfmake:

```
export function generatePatientReportDefinition(patientData: any, patientVitals: PatientVitals) {
  // Document structure creation
  // Chart generation
  // Statistical calculation
  // Formatting and styling
}

```

Key features:

- Calculates vital statistics (min, max, average, std deviation)
- Generates line charts for vitals visualization
- Creates a comprehensive PDF structure with sections
- Formats data for easy clinical interpretation

7. API Routes (server/routes.ts)

All API endpoints are defined here:

```
export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication setup
  // Health check endpoint
  // File upload endpoint
  // Patient prompt endpoints
  // Regeneration endpoints
  // Triage endpoints
  // Monthly reports endpoints
}

```

Notable API endpoints:

- `/api/upload`: Excel file processing
- `/api/patient-prompts/:batchId`: Batch prompt retrieval
- `/api/triage/alerts`: Alert management
- `/api/monthly-reports`: PDF report generation
- `/api/regenerate`: Prompt regeneration

8. Server Setup (server/index.ts)

Main entry point with Express configuration:

```
// Express middleware setup
// Error handling
// Vite integration
// Global error handlers
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(`Server error:`, { status: err.status, message: err.message });
  res.status(err.status || 500).json({
    success: false,
    data: null,
    error: err.message || "Internal Server Error"
  });
});

```

Key features:

- Standardized error handling for all routes
- CORS configuration
- Request logging
- Global unhandled exception handlers

V. Frontend Components In-Depth

1. Application Router (client/src/App.tsx)

Sets up the main application routes:

```
function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={HomePage} />
      <ProtectedRoute path="/patient-prompts" component={PatientPrompts} />
      <ProtectedRoute path="/prompt-editing" component={PromptEditingSandbox} />
      <ProtectedRoute path="/triage" component={AIPoweredTriage} />
      <ProtectedRoute path="/monthly-reports" component={MonthlyReports} />
      <ProtectedRoute path="/settings" component={SettingsPage} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

```

The `ProtectedRoute` component ensures authentication before allowing access.

2. Authentication Hook (client/src/hooks/use-auth.tsx)

Centralized authentication management:

```
export function useAuth() {
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const loginMutation = useMutation({ /* login logic */ });
  const registerMutation = useMutation({ /* register logic */ });
  const logoutMutation = useMutation({ /* logout logic */ });

  return { user, isLoading, error, loginMutation, logoutMutation, registerMutation };
}

```

This hook:

- Manages user authentication state
- Provides login/logout/register mutations
- Handles API errors and loading states

3. Patient Prompts Page (client/src/pages/PatientPrompts.tsx)

Displays and manages generated patient prompts:

```
export default function PatientPrompts() {
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);

  // Batch data fetching with React Query
  // Prompt data fetching for selected batch
  // Regeneration mutation
  // UI rendering with proper loading states
}

```

Key features:

- Batch selection and management
- Prompt card display with reasoning extraction
- Regeneration functionality
- Sort and filter options

4. AI-Powered Triage (client/src/pages/AIPoweredTriage.tsx)

Alert management system:

```
export default function AIPoweredTriage() {
  // Alert data fetching
  // SMS notification mutation
  // Severity filtering (RED, YELLOW, GREEN)
  // Alert card rendering
}

```

Key features:

- Alert severity visualization
- SMS notification triggering
- Alert status tracking
- Filtering options

5. Prompt Editing Sandbox (client/src/pages/PromptEditingSandbox.tsx)

System prompt customization interface:

```
export default function PromptEditingSandbox() {
  // System prompt fetching and updating
  // Template variables management
  // Test prompt generation
  // Editor UI with CodeMirror
}

```

Key features:

- Live preview of edited prompts
- Template variable management
- System prompt customization
- Test generation for validation

6. Monthly Reports (client/src/pages/MonthlyReports.tsx)

PDF report generation interface:

```
export default function MonthlyReports() {
  // Available reports fetching
  // Report generation mutation
  // PDF download handling
  // Report preview
}

```

Key features:

- Report generation by month/year
- PDF preview and download
- Patient selection
- Historical report access

7. API Integration (client/src/lib/queryClient.ts)

Centralized API communication:

```
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function apiRequest(
  method: string,
  url: string,
  body?: any,
  options?: RequestInit
): Promise<Response> {
  // Request building
  // Authentication handling
  // Error processing
}

export function getQueryFn({ on401 = "throw" }: { on401?: "throw" | "returnNull" } = {}) {
  // Default query function for React Query
  // Authentication handling
  // Response processing
}

```

Key features:

- Authentication header injection
- Standardized error handling
- Query invalidation helpers
- Response processing

VI. Migration Guide for Healthcare Company Integration

1. Database Migration

Current Database Configuration

```
// Current PostgreSQL connection (Neon serverless)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000
});
export const db = drizzle(pool, { schema });

```

Migration Steps

1. **Schema Analysis**:
    - Review all table definitions in `shared/schema.ts`
    - Identify any schema modifications needed for compatibility
2. **Connection Configuration**:
    - Update `server/db.ts` to use your PostgreSQL configuration
    
    ```
    // For standard PostgreSQL
    import { drizzle } from 'drizzle-orm/node-postgres';
    import { Pool } from 'pg';
    
    const pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      max: 20 // Adjust based on your workload
    });
    
    export const db = drizzle(pool, { schema });
    
    ```
    
3. **Schema Migration**:
    - Use Drizzle's migration tool to create the schema
    
    ```
    npx drizzle-kit push:pg --schema=./shared/schema.ts --out=./drizzle
    
    ```
    
    - Or manually create tables using the schema definitions
4. **Data Migration** (if applicable):
    - Create scripts to import existing patient data
    - Map fields from your current system to CalicoCare schema

2. Environment Configuration

Create a `.env` file with these variables:

```
# Database
DB_HOST=your-postgres-host
DB_PORT=5432
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=your-db-name
DATABASE_URL=postgresql://your-db-user:your-db-password@your-postgres-host:5432/your-db-name

# Authentication
SESSION_SECRET=your-secure-session-secret

# OpenAI
OPENAI_API_KEY=your-openai-api-key

# Twilio (for SMS notifications)
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=your-twilio-phone

# Server
PORT=5000
NODE_ENV=production

```

3. API Integration with Existing Systems

1. **Patient Data Integration**:
    - Modify `server/lib/excelProcessor.ts` to accept data from your systems
    - Consider creating a new data ingestion module specific to your EHR/EMR
2. **Authentication Integration**:
    - Options:a. Keep the existing authentication (modify `server/auth.ts`)b. Integrate with your SSO system (SAML, OAuth, etc.)c. Use your existing user database
3. **Notification Integration**:
    - Update Twilio settings or replace with your notification system
    - Modify `server/routes.ts` alert notification functions

4. Data Privacy & HIPAA Compliance

1. **PII/PHI Handling**:
    - Review data saved to database in `server/storage.ts`
    - Ensure sensitive fields are properly encrypted/anonymized
2. **Logging Configuration**:
    - Update logging in `server/index.ts` to comply with your policies
    - Remove any PII/PHI from logs
3. **Security Headers**:
    - Add security headers to `server/index.ts`:
    
    ```
    app.use(helmet()); // Add proper security headers
    
    ```
    

5. Deployment Options

1. **Containerization**:
    - Create a Dockerfile:
    
    ```
    FROM node:20-alpine
    WORKDIR /app
    COPY package*.json ./
    RUN npm ci
    COPY . .
    RUN npm run build
    EXPOSE 5000
    CMD ["npm", "start"]
    
    ```
    
2. **Kubernetes Deployment**:
    - Create deployment and service YAML files
    - Configure health checks using `/api/health` endpoint
3. **Traditional VM Deployment**:
    - Set up Node.js with proper process management (PM2)
    - Configure Nginx/Apache as reverse proxy

6. Performance Optimization

1. **Connection Pooling**:
    - Adjust PostgreSQL pool settings in `server/db.ts`:
    
    ```
    const pool = new Pool({
      // ...other settings
      max: 50, // Increase for high traffic
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
    
    ```
    
2. **Caching Strategy**:
    - Implement Redis for session caching
    - Add caching layer for frequently accessed prompts
3. **Horizontal Scaling**:
    - Ensure application is stateless (move all state to database)
    - Configure load balancing across multiple instances

7. Integration Testing Plan

1. **Database Connectivity**:
    - Test connection to your PostgreSQL database
    - Verify schema migration success
2. **Authentication Flow**:
    - Test user login with your credentials system
    - Verify session persistence
3. **Data Processing**:
    - Test patient data import from your systems
    - Verify AI prompt generation with your data
4. **Notification Flow**:
    - Test alert generation
    - Verify notification delivery through your systems
5. **Report Generation**:
    - Test PDF report generation with your patient data
    - Verify metrics calculation accuracy

VII. Additional Technical Insights

Error Handling Strategy

The application uses a multi-layered error handling approach:

1. **Global Error Handlers**:
    
    ```
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Promise Rejection:', reason);
    });
    
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
    });
    
    ```
    
2. **Express Error Middleware**:
    
    ```
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      res.status(status).json({
        success: false,
        data: null,
        error: err.message || "Internal Server Error"
      });
    });
    
    ```
    
3. **API Error Standardization**:
    
    All API endpoints return a consistent format:
    
    ```
    {
      success: boolean,
      data: T | null,
      error?: string
    }
    
    ```
    
4. **Database Error Handling**:
    
    Each database operation includes proper try/catch blocks with specific error responses.
    

API Key Management

The application reads API keys from environment variables:

- OpenAI: `OPENAI_API_KEY`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

For your company integration, consider:

1. Using a dedicated secrets management system (HashiCorp Vault, AWS Secrets Manager)
2. Implementing API key rotation policies
3. Setting up monitoring for API usage and rate limits

Cost Optimization for AI

The application includes token usage tracking in `server/lib/tokenUsageEstimator.ts`:

```
export function estimateSinglePromptUsage(inputText: string, outputText: string): TokenUsage {
  const inputTokens = estimateTokens(inputText);
  const outputTokens = estimateTokens(outputText);

  // Cost calculation based on OpenAI pricing
  const inputCost = inputTokens * 0.00001; // $0.01 per 1K tokens
  const outputCost = outputTokens * 0.00003; // $0.03 per 1K tokens

  return {
    inputTokens,
    outputTokens,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost
  };
}

```

Optimize costs by:

1. Adjusting the caching strategy in `server/lib/openai.ts`
2. Implementing rate limiting for regeneration requests
3. Setting up budget alerts based on token usage

This comprehensive documentation should provide your healthcare company with a complete understanding of the CalicoCare codebase and a clear path for integration with your existing systems.
