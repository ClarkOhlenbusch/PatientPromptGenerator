# Vapi API Structure & Integration

## Current Vapi Configuration

### Assistant Configuration
- **Assistant ID**: `d289d8be-be92-444e-bb94-b4d25b601f82`
- **Assistant Name**: CalicoCareAgent
- **Created**: 2025-05-23T15:30:28.664Z
- **Last Updated**: 2025-05-29T15:25:47.199Z

### Voice & AI Configuration
```json
{
  "llm": {
    "provider": "openai",
    "model": "gpt-4o-mini"
  },
  "voice": {
    "provider": "vapi",
    "voiceId": "Kylie",
    "model": "eleven_turbo_v2_5"
  },
  "transcriber": {
    "provider": "deepgram",
    "model": "nova-3"
  },
  "toolIds": ["69be15fd-1002-4b9d-9e14-e9e593de94fa"]
}
```

### Phone Number Configuration
- **Phone Number ID**: `f412bd32-9764-4d70-94e7-90f87f84ef08`
- **Phone Number**: `+16174020024`
- **Name**: Calico Care Agent
- **Status**: Active
- **Created**: 2025-05-27T13:13:39.718Z

## API Endpoints & Integration Patterns

### 1. Call Initiation Endpoint
**Route**: `POST /api/vapi/companion-call`

**Request Structure**:
```typescript
interface CompanionCallRequest {
  patientId: string;
  patientName: string;
  phoneNumber: string; // E.164 format
  personalInfo?: string;
  callConfig?: {
    maxDuration?: number;
    conversationStyle?: string;
    topics?: string[];
    personalizedPrompt?: string;
  };
}
```

**Vapi API Call Structure**:
```typescript
const callRequest = {
  phoneNumberId: "f412bd32-9764-4d70-94e7-90f87f84ef08",
  customer: {
    number: formattedPhoneNumber // E.164 format
  },
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
    callType: "companion"
  }
};
```

**Vapi API Endpoint**: `https://api.vapi.ai/call`

### 2. Webhook Processing Endpoint
**Route**: `POST /api/vapi/webhook`

**Webhook Message Types**:
- `end-of-call-report` - Primary handler for call completion
- `speech-update` - Real-time speech updates
- `transcript` - Transcript updates
- `function-call` - Tool/function calls
- `hang` - Call hang-up events
- `speech-started` - Speech detection start
- `speech-ended` - Speech detection end

**End-of-Call-Report Structure**:
```typescript
interface EndOfCallReport {
  message: {
    type: "end-of-call-report";
    call: {
      id: string;
      startedAt: string;
      endedAt: string;
      customer: {
        number: string;
      };
      metadata: {
        patientId: string;
        patientName: string;
        callType: string;
      };
    };
    transcript: string;
    summary: string;
    endedReason: string; // "customer-hangup" | "assistant-hangup" | "customer-did-not-answer" | "customer-busy" | "error"
  };
}
```

### 3. Assistant Management Endpoints
**Get Assistant**: `GET /api/vapi/agent`
**Update Assistant**: `PATCH /api/vapi/agent`

**Vapi API Endpoint**: `https://api.vapi.ai/assistant/{assistantId}`

### 4. Call History Management
**Get Call History**: `GET /api/call-history`
**Get Call Details**: `GET /api/call-history/:callId`
**Update Call**: `PATCH /api/call-history/:callId`
**Delete Call**: `DELETE /api/call-history/:callId`
**Get Call Statistics**: `GET /api/call-history/stats`
**Export Call History**: `GET /api/call-history/export`

## Variable System Integration

### Variable-Based Prompt System
Vapi uses a variable replacement system that allows dynamic content injection:

```typescript
// Variables available in assistant prompts
const variableValues = {
  patientName: "John Doe",
  patientAge: 65,
  patientCondition: "Diabetes Type 2",
  patientPrompt: "Focus on medication compliance and diet",
  conversationHistory: "Previous call discussed blood sugar levels"
};
```

### Template Usage in Prompts
Variables are referenced in assistant prompts using double curly braces:
```
Hello {{patientName}}, this is your healthcare assistant. 
I see you're {{patientAge}} years old and managing {{patientCondition}}.
{{patientPrompt}}
Based on our conversation history: {{conversationHistory}}
```

## Call Status Management

### Call Status Types
- `completed` - Successful call completion
- `failed` - Call failed due to technical issues
- `no-answer` - Customer did not answer
- `busy` - Customer line was busy
- `pending` - Call initiated but not yet completed

### Status Mapping from Vapi
```typescript
function mapVapiEndReason(endedReason: string): string {
  switch (endedReason.toLowerCase()) {
    case "customer-hangup":
    case "assistant-hangup":
      return "completed";
    case "customer-did-not-answer":
      return "no-answer";
    case "customer-busy":
      return "busy";
    case "error":
      return "failed";
    default:
      return endedReason;
  }
}
```

## AI-Powered Call Analysis

### OpenAI Integration for Call Summarization
```typescript
async function generateConversationSummary(transcript: string, vapiSummary?: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a healthcare assistant analyzing patient call transcripts."
      },
      {
        role: "user",
        content: `Analyze this healthcare call transcript and extract key information...
        
        Transcript: ${transcript}
        ${vapiSummary ? `Vapi Summary: ${vapiSummary}` : ''}`
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.3
  });

  return {
    summary: string,
    keyPoints: string[],
    healthConcerns: string[],
    followUpItems: string[]
  };
}
```

## Phone Number Formatting

### E.164 Format Standardization
```typescript
function formatPhoneNumberE164(phoneNumber: string): string {
  // Remove all non-digit characters except +
  let cleaned = phoneNumber.replace(/[^\d+]/g, '');

  // If it doesn't start with +, assume US number
  if (!cleaned.startsWith('+')) {
    // Remove any leading 1 if present, then add +1
    cleaned = cleaned.replace(/^1/, '');
    cleaned = '+1' + cleaned;
  }

  return cleaned;
}
```

## Error Handling Patterns

### Vapi API Error Handling
```typescript
try {
  const vapiResponse = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(callRequest)
  });

  if (!vapiResponse.ok) {
    const errorData = await vapiResponse.json();
    
    // Handle specific Vapi errors
    if (errorData.message?.includes("Daily Outbound Call Limit")) {
      throw new Error("Daily call limit reached. Import your own Twilio number for unlimited calls.");
    }
    
    throw new Error(errorData.message || "Failed to initiate call");
  }

  const callData = await vapiResponse.json();
  return { success: true, callId: callData.id };
  
} catch (error) {
  console.error("Vapi call error:", error);
  return { success: false, message: error.message };
}
```

### Webhook Error Recovery
```typescript
app.post("/api/vapi/webhook", async (req, res) => {
  try {
    const webhookData = req.body;
    
    // Always respond with 200 to prevent webhook retries
    res.status(200).json({ success: true });
    
    // Process webhook asynchronously
    await processWebhookAsync(webhookData);
    
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Still return 200 to prevent retries
    res.status(200).json({ success: false, error: error.message });
  }
});
```

## Authentication & Security

### API Key Management
```typescript
// Environment variable configuration
const vapiPrivateKey = process.env.VAPI_PRIVATE_KEY;
const vapiPublicKey = process.env.VAPI_PUBLIC_KEY;

// Prefer private key, fallback to public key
const apiKey = vapiPrivateKey || vapiPublicKey;
const keyType = vapiPrivateKey ? "private" : "public";
```

### Webhook Security
- No authentication required for webhooks (Vapi design)
- Webhook endpoint accessible without auth: `/api/vapi/webhook`
- Validation through request structure and expected data format

## Rate Limiting & Constraints

### Vapi Free Tier Limitations
- **Daily Call Limits**: Limited number of outbound calls per day
- **Phone Number Restrictions**: Must use provided phone numbers
- **Webhook Delivery**: Dependent on external webhook reliability

### Optimization Strategies
- **Error Handling**: Graceful degradation when limits reached
- **User Communication**: Clear messaging about limitations
- **Alternative Solutions**: Guidance for upgrading to paid tiers

## Testing & Development

### Webhook Testing Endpoint
**Route**: `POST /api/vapi/webhook/test`

Simulates a complete webhook flow for testing:
```typescript
const simulatedWebhook = {
  message: {
    type: "end-of-call-report",
    call: {
      id: "test-call-" + Date.now(),
      startedAt: new Date(Date.now() - 120000).toISOString(),
      endedAt: new Date().toISOString(),
      customer: { number: "+1234567890" },
      metadata: {
        patientId: "test-patient",
        patientName: "Test Patient",
        batchId: "test-batch"
      }
    },
    transcript: "Test conversation transcript...",
    summary: "Test call summary",
    endedReason: "customer-hangup"
  }
};
```

### Development Utilities
- **Webhook Test Endpoint**: `/api/vapi/webhook/test`
- **Webhook Accessibility Check**: `GET /api/vapi/webhook`
- **Assistant Configuration Retrieval**: `GET /api/vapi/agent`

## Integration Best Practices

### Call Initiation Best Practices
1. **Phone Number Validation**: Always format to E.164 before sending
2. **Variable Preparation**: Ensure all required variables are populated
3. **Error Handling**: Provide clear user feedback for failures
4. **Metadata Tracking**: Include comprehensive metadata for call tracking

### Webhook Processing Best Practices
1. **Immediate Response**: Always return 200 status quickly
2. **Async Processing**: Handle complex processing asynchronously
3. **Idempotent Operations**: Prevent duplicate processing
4. **Comprehensive Logging**: Log all webhook events for debugging

### Database Integration Best Practices
1. **Call History Storage**: Store comprehensive call data immediately
2. **AI Analysis**: Process transcripts for healthcare insights
3. **Error Recovery**: Handle partial data gracefully
4. **Performance Optimization**: Use efficient queries for call retrieval 

## Webhook Request Verification

All webhooks should be verified for security. The server should validate:
- Request signature (if configured)
- Expected payload structure
- Rate limiting

---

## 🆕 Enhanced Call Context Injection Solution

### Problem Solved
Vapi AI doesn't support live context injection, so patient-specific triage prompts from the database needed to be injected into calls before initiation.

### Solution Implemented

#### 1. **New Triage Call Endpoint**: `/api/vapi/triage-call`
- Fetches patient's latest triage prompt from `patient_prompts` table
- Retrieves call history for context continuity
- Injects full patient assessment into system prompt
- Uses both `assistantOverrides.model.messages` and `variableValues` for maximum compatibility

#### 2. **Context Preview Endpoint**: `/api/vapi/triage-context`  
- Allows previewing the exact context that will be injected
- Shows enhanced system prompt with patient data
- Useful for testing and debugging context injection

#### 3. **Enhanced System Prompt Injection**
```javascript
// Template replacement approach
enhancedSystemPrompt = voiceAgentTemplate
  .replace(/PATIENT_NAME/g, patientName || patientId)
  .replace(/PATIENT_AGE/g, age?.toString() || "unknown age") 
  .replace(/PATIENT_CONDITION/g, condition || "general health assessment")
  .replace(/PATIENT_PROMPT/g, triagePrompt || "No specific care assessment available")
  .replace(/CONVERSATION_HISTORY/g, recentCall?.summary || "This is your first conversation with this patient.");
```

#### 4. **Call Request Structure** 
```javascript
const callRequest = {
  phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
  customer: { number: formattedPhoneNumber },
  assistantId: "d289d8be-be92-444e-bb94-b4d25b601f82",
  assistantOverrides: {
    // Primary method: Complete system prompt override
    model: {
      provider: "openai",
      model: "gpt-4o-mini", 
      messages: [{ role: "system", content: enhancedSystemPrompt }]
    },
    // Backup method: Variable values for template replacement
    variableValues: {
      patientName, patientAge, patientCondition, 
      patientPrompt: triagePrompt, conversationHistory
    }
  },
  metadata: { patientId, callType: "triage", hasTriageData: true }
};
```

#### 5. **Frontend Integration**
- Added new "Triage Calls with Patient Context" section in AICompanionCalls.tsx
- Patient selection dropdown with triage data
- Context preview functionality 
- Success/error handling with user feedback

### Key Benefits
1. **Full Context**: Complete triage assessment injected into every call
2. **Call Continuity**: Previous call summaries included automatically
3. **Dual Injection**: Uses both system prompt override AND variable values
4. **User-Friendly**: Easy-to-use interface with context preview
5. **Replit Compatible**: Works seamlessly in Replit SSH environment

### Usage
1. Navigate to AI Companion Calls page
2. Use "Triage Calls with Patient Context" section
3. Select patient with triage data
4. Preview context (optional) to verify prompt injection
5. Initiate call with full patient assessment context

This solution completely solves the call context injection problem by ensuring that every Vapi call includes the patient's complete triage assessment and health data from the database. 