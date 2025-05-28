# VAPI API Reference Documentation

## Overview
This document contains comprehensive information about the VAPI API for making voice calls, based on official documentation.

## API Endpoints

### 1. Create Call Endpoints

#### Primary Endpoint: `/call`
- **URL**: `https://api.vapi.ai/call`
- **Method**: POST
- **Purpose**: General call creation (web calls, scheduled calls)

#### Phone Call Endpoint: `/call/phone`
- **URL**: `https://api.vapi.ai/call/phone`
- **Method**: POST
- **Purpose**: Outbound phone calls specifically
- **Note**: This is the endpoint used in working examples and documentation

## Authentication

### Bearer Token Authentication
```
Authorization: Bearer <token>
```

### Key Types
- **Private Key**: For server-side API calls, full access
- **Public Key**: For client-side web calls, limited access
- **Environment Variables**:
  - `VAPI_PRIVATE_KEY` - For server-side operations
  - `VAPI_PUBLIC_KEY` - For client-side operations

## Phone Number Format Requirements

### E.164 Format Required
- **Format**: `+[country_code][phone_number]`
- **US Example**: `+17814243027` (not `7814243027`)
- **Error Message**: "customer.number must be a valid phone number in the E.164 format. Hot tip, you may be missing the country code (Eg. US: +1)."

### Phone Number Validation
- Must include country code prefix
- US numbers: `+1` prefix required
- International numbers: appropriate country code required

## Request Payload Structure

### Basic Outbound Call Structure
```json
{
  "name": "Call Name (optional, <=40 characters)",
  "phoneNumberId": "your-phone-number-id",
  "customer": {
    "number": "+17814243027",
    "name": "Customer Name"
  },
  "assistantId": "your-assistant-id"
}
```

### With Assistant Overrides
```json
{
  "name": "Companion Call - Patient Name",
  "phoneNumberId": "your-phone-number-id",
  "customer": {
    "number": "+17814243027",
    "name": "Patient Name"
  },
  "assistantId": "your-assistant-id",
  "assistantOverrides": {
    "firstMessage": "Custom greeting message",
    "model": {
      "provider": "openai",
      "model": "gpt-4o-mini",
      "messages": [
        {
          "role": "system",
          "content": "Custom system prompt"
        }
      ]
    },
    "maxDurationSeconds": 900,
    "metadata": {
      "key": "value"
    },
    "variableValues": {
      "patientName": "John Doe",
      "customVariable": "value"
    }
  }
}
```

## Required Fields

### Mandatory Fields
- `phoneNumberId`: ID of your VAPI phone number
- `customer.number`: Phone number in E.164 format
- Either `assistantId` OR `assistant` (transient assistant)

### Optional Fields
- `name`: Call identifier (max 40 characters)
- `customer.name`: Customer name
- `assistantOverrides`: Customize assistant behavior
- `schedulePlan`: For scheduled calls
- `metadata`: Additional data

## Assistant Configuration

### Using Existing Assistant
```json
{
  "assistantId": "your-assistant-id",
  "assistantOverrides": {
    // Override specific properties
  }
}
```

### Using Transient Assistant
```json
{
  "assistant": {
    "model": { "provider": "openai", "model": "gpt-4o" },
    "voice": { "provider": "azure", "voiceId": "andrew" },
    "transcriber": { "provider": "deepgram" },
    "firstMessage": "Hello!",
    // ... full assistant configuration
  }
}
```

## Error Handling

### Common Errors

#### Phone Number Format Error
```json
{
  "message": [
    "customer.number must be a valid phone number in the E.164 format. Hot tip, you may be missing the country code (Eg. US: +1)."
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

#### Authentication Error
```json
{
  "message": "Unauthorized",
  "error": "Unauthorized",
  "statusCode": 401
}
```

#### Daily Limit Error
```json
{
  "message": "Couldn't Start Call. Numbers Bought On Vapi Have A Daily Outbound Call Limit. Import Your Own Twilio Numbers To Scale Without Limits.",
  "error": "Bad Request",
  "statusCode": 400
}
```

## Best Practices

### Phone Number Handling
1. Always validate phone numbers before sending
2. Add country code if missing (assume +1 for US)
3. Remove non-digit characters except the + prefix
4. Validate E.164 format before API call

### Authentication
1. Use `VAPI_PRIVATE_KEY` for server-side calls
2. Store keys securely in environment variables
3. Never expose private keys in client-side code

### Error Handling
1. Check response status codes
2. Parse error messages for specific issues
3. Implement retry logic for transient errors
4. Log detailed error information for debugging

## Limitations

### Free VAPI Numbers
- Daily outbound call limits
- US national use only
- No international calling
- Maximum 10 free numbers per account

### Solutions for Scale
- Import Twilio numbers for unlimited calls
- Use international numbers for global reach
- Implement proper error handling for limits

## Working Examples

### Successful Triage Call Pattern
```javascript
const response = await fetch("https://api.vapi.ai/call/phone", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
    customer: {
      number: "+17814243027",
      name: "Patient Name"
    },
    assistantId: "your-assistant-id",
    assistantOverrides: {
      variableValues: {
        patientName: "John Doe",
        patientAge: 45,
        patientPrompt: "Custom prompt content"
      }
    }
  })
});
```

## Key Differences from Our Implementation

### Endpoint Usage
- **Working triage calls**: Use `/call/phone` endpoint ✅
- **Failing companion calls**: Were using `/call` endpoint ❌

### Phone Number Format
- **Working triage calls**: Proper E.164 format ✅
- **Failing companion calls**: Missing country code ❌

### Payload Structure
- **Working triage calls**: Correct VAPI structure ✅
- **Failing companion calls**: Incorrect structure ❌

## Phone Number Formatting Function

### JavaScript Implementation
```javascript
function formatPhoneNumberE164(phoneNumber) {
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

// Examples:
// formatPhoneNumberE164('7814243027') → '+17814243027'
// formatPhoneNumberE164('(781) 424-3027') → '+17814243027'
// formatPhoneNumberE164('+1 781-424-3027') → '+17814243027'
```

## Debugging Checklist

### Before Making API Call
1. ✅ Verify phone number is in E.164 format
2. ✅ Confirm using `/call/phone` endpoint
3. ✅ Check `VAPI_PRIVATE_KEY` is set
4. ✅ Validate `phoneNumberId` exists
5. ✅ Ensure `assistantId` is valid

### Common Issues Resolution
1. **E.164 Format Error**: Add country code prefix
2. **Authentication Error**: Check private key
3. **Daily Limit Error**: Use imported Twilio number
4. **Assistant Not Found**: Verify assistant ID
5. **Phone Number Not Found**: Check phone number ID

## Testing Strategy

### Step-by-Step Validation
1. Test phone number formatting function
2. Verify API credentials
3. Test with minimal payload first
4. Add complexity incrementally
5. Compare with working triage implementation

### Minimal Test Payload
```json
{
  "phoneNumberId": "your-phone-number-id",
  "customer": {
    "number": "+17814243027"
  },
  "assistantId": "your-assistant-id"
}
```
