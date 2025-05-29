import { Express, Request, Response } from "express";
import { storage } from "../storage";
import OpenAI from "openai";

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Generate AI-powered conversation summary from call transcript
async function generateConversationSummary(transcript: string, vapiSummary?: string) {
  try {
    const prompt = `
Analyze this healthcare call transcript and extract key information for follow-up care.
Provide your response in JSON format with the following structure:

{
  "summary": "Brief 2-3 sentence overview of the call",
  "keyPoints": ["Key talking point 1", "Key talking point 2", ...],
  "healthConcerns": ["Health concern 1", "Health concern 2", ...],
  "followUpItems": ["Follow-up item 1", "Follow-up item 2", ...]
}

Focus on:
- Patient's current health status and any new symptoms
- Medication compliance and concerns
- Lifestyle updates that could affect health
- Questions or concerns the patient raised
- Items that should be mentioned in future calls

Transcript:
${transcript}

${vapiSummary ? `Vapi Summary: ${vapiSummary}` : ''}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Using your preferred model for speed and cost
      messages: [
        {
          role: "system",
          content: "You are a healthcare assistant analyzing patient call transcripts. Extract key information that would be valuable for healthcare providers and future follow-up calls."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    return {
      summary: result.summary || "Call completed successfully",
      keyPoints: result.keyPoints || [],
      healthConcerns: result.healthConcerns || [],
      followUpItems: result.followUpItems || []
    };
  } catch (error) {
    console.error("Error generating conversation summary:", error);
    return {
      summary: vapiSummary || "Call completed - summary generation failed",
      keyPoints: [],
      healthConcerns: [],
      followUpItems: []
    };
  }
}

export function registerVapiRoutes(app: Express): void {
  // === VAPI VOICE CALLING ENDPOINTS ===

  // Get voice agent template
  app.get("/api/voice-agent-template", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const template = await storage.getVoiceAgentTemplate();
      return res.status(200).json({
        success: true,
        template: template
      });

    } catch (error) {
      console.error("Error fetching voice agent template:", error);
      return res.status(500).json({
        success: false,
        message: `Error fetching template: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  });

  // Update voice agent template
  app.post("/api/voice-agent-template", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { template } = req.body;
      if (!template) {
        return res.status(400).json({
          success: false,
          message: "Template is required"
        });
      }

      await storage.updateVoiceAgentTemplate(template);
      return res.status(200).json({
        success: true,
        message: "Voice agent template updated successfully"
      });

    } catch (error) {
      console.error("Error updating voice agent template:", error);
      return res.status(500).json({
        success: false,
        message: `Error updating template: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  });

  // Vapi webhook to receive call completion data (no auth required for webhooks)
  app.post("/api/vapi/webhook", async (req: Request, res: Response) => {
    try {
      console.log("🎯 WEBHOOK RECEIVED! Timestamp:", new Date().toISOString());
      console.log("🎯 Webhook message type:", req.body?.message?.type);
      console.log("🎯 Webhook body:", JSON.stringify(req.body, null, 2));

      const webhookData = req.body;

      // Log all message types for debugging
      if (webhookData.message?.type) {
        console.log(`📋 Webhook message type: ${webhookData.message.type}`);

        // List common VAPI webhook types for reference
        const knownTypes = [
          "end-of-call-report",
          "speech-update",
          "transcript",
          "function-call",
          "hang",
          "speech-started",
          "speech-ended"
        ];

        if (!knownTypes.includes(webhookData.message.type)) {
          console.log(`⚠️  Unknown webhook type: ${webhookData.message.type}`);
        }
      }

      if (webhookData.message?.type === "end-of-call-report") {
        const { message } = webhookData;
        const call = message.call;
        const transcript = message.transcript;
        const summary = message.summary;

        console.log("Processing end-of-call-report:", {
          callId: call?.id,
          hasTranscript: !!transcript,
          hasSummary: !!summary,
          metadata: call?.metadata
        });

        if (call?.id) {
          // Generate AI-powered conversation summary from transcript
          const aiSummary = await generateConversationSummary(transcript || "", summary);

          // Extract patient info from call metadata
          const patientId = call.metadata?.patientId || "unknown";
          const patientName = call.metadata?.patientName || "Unknown Patient";
          const phoneNumber = call.customer?.number || "";

          // Calculate call duration
          const duration = call.endedAt && call.startedAt ?
            Math.floor((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000) : 0;

          // Determine call status based on end reason
          let callStatus = "completed";
          if (message.endedReason) {
            switch (message.endedReason.toLowerCase()) {
              case "customer-hangup":
              case "assistant-hangup":
                callStatus = "completed";
                break;
              case "customer-did-not-answer":
                callStatus = "no-answer";
                break;
              case "customer-busy":
                callStatus = "busy";
                break;
              case "error":
                callStatus = "failed";
                break;
              default:
                callStatus = message.endedReason;
            }
          }

          // Store call history in database
          await storage.createCallHistory({
            callId: call.id,
            patientId,
            patientName,
            phoneNumber,
            duration,
            status: callStatus,
            transcript: transcript || "",
            summary: aiSummary.summary,
            keyPoints: aiSummary.keyPoints,
            healthConcerns: aiSummary.healthConcerns,
            followUpItems: aiSummary.followUpItems,
            callDate: call.endedAt ? new Date(call.endedAt) : new Date()
          });

          console.log(`✅ Stored call history for patient ${patientName} (${call.id})`);
        }
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("❌ Error processing Vapi webhook:", error);
      return res.status(500).json({
        success: false,
        message: "Error processing webhook"
      });
    }
  });

  // Test endpoint to verify webhook is accessible (for debugging)
  app.get("/api/vapi/webhook", async (req: Request, res: Response) => {
    console.log("🧪 Webhook test endpoint accessed");
    return res.status(200).json({
      success: true,
      message: "Webhook endpoint is accessible",
      timestamp: new Date().toISOString()
    });
  });

  // Test endpoint to simulate a VAPI webhook for testing call history
  app.post("/api/vapi/webhook/test", async (req: Request, res: Response) => {
    try {
      console.log("🧪 SIMULATING VAPI WEBHOOK FOR TESTING - START");
      console.log("🧪 Request headers:", req.headers);
      console.log("🧪 Request body:", req.body);

      // Create a simulated webhook payload
      const simulatedWebhook = {
        message: {
          type: "end-of-call-report",
          call: {
            id: "test-call-" + Date.now(),
            startedAt: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
            endedAt: new Date().toISOString(),
            customer: {
              number: "+1234567890"
            },
            metadata: {
              patientId: "Diane, Affre (11/16/1943 )",
              patientName: "Diane, Affre",
              batchId: "test-batch"
            }
          },
          transcript: "Hello Diane, this is your healthcare assistant calling to check in on how you're feeling today. How have you been since our last conversation? I see from your recent health data that everything looks good - your heart rate is stable at 86 bpm. That's excellent! Are you keeping up with your regular physical activity? Great to hear. Remember to maintain that balanced diet we discussed, especially those heart-healthy foods rich in omega-3 fatty acids. Is there anything specific about your health that you'd like to discuss today?",
          summary: "Routine check-in call with Diane Affre. Patient reports feeling well and maintaining good health habits. Heart rate stable, continuing recommended diet and exercise routine.",
          endedReason: "customer-hangup"
        }
      };

      // Process the simulated webhook through our existing webhook handler
      const webhookData = simulatedWebhook;

      if (webhookData.message?.type === "end-of-call-report") {
        const { message } = webhookData;
        const call = message.call;
        const transcript = message.transcript;
        const summary = message.summary;

        console.log("🧪 Processing simulated end-of-call-report:", {
          callId: call?.id,
          hasTranscript: !!transcript,
          hasSummary: !!summary,
          metadata: call?.metadata
        });

        if (call?.id) {
          console.log("🧪 Step 1: Generating AI summary...");
          // Generate AI-powered conversation summary from transcript
          const aiSummary = await generateConversationSummary(transcript || "", summary);
          console.log("🧪 Step 1 Complete: AI summary generated:", aiSummary);

          // Extract patient info from call metadata
          const patientId = call.metadata?.patientId || "test-patient";
          const patientName = call.metadata?.patientName || "Test Patient";
          const phoneNumber = call.customer?.number || "+1234567890";

          // Calculate call duration
          const duration = call.endedAt && call.startedAt ?
            Math.floor((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000) : 120;

          console.log("🧪 Step 2: Preparing call history data:", {
            callId: call.id,
            patientId,
            patientName,
            phoneNumber,
            duration,
            status: "completed"
          });

          // Store call history in database
          console.log("🧪 Step 3: Storing in database...");
          const storedCall = await storage.createCallHistory({
            callId: call.id,
            patientId,
            patientName,
            phoneNumber,
            duration,
            status: "completed",
            transcript: transcript || "",
            summary: aiSummary.summary,
            keyPoints: aiSummary.keyPoints,
            healthConcerns: aiSummary.healthConcerns,
            followUpItems: aiSummary.followUpItems,
            callDate: call.endedAt ? new Date(call.endedAt) : new Date()
          });

          console.log(`🧪 ✅ Step 3 Complete: Stored test call history for patient ${patientName} (${call.id})`);
          console.log("🧪 Stored call record:", storedCall);
        } else {
          console.log("🧪 ❌ No call ID found in webhook data");
        }
      }

      console.log("🧪 ✅ WEBHOOK TEST COMPLETED SUCCESSFULLY");
      return res.status(200).json({
        success: true,
        message: "Test webhook processed successfully",
        callId: simulatedWebhook.message.call.id
      });
    } catch (error) {
      console.error("🧪 ❌ WEBHOOK TEST FAILED - Error processing test webhook:", error);
      console.error("🧪 Error stack:", error.stack);
      return res.status(500).json({
        success: false,
        message: "Error processing test webhook",
        error: error.message
      });
    }
  });

  // Initiate companion call endpoint
  app.post("/api/vapi/companion-call", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const { patientId, patientName, phoneNumber, personalInfo, callConfig } = req.body;

      if (!patientId || !patientName || !phoneNumber) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: patientId, patientName, phoneNumber"
        });
      }

      console.log("🤝 Initiating companion call:", {
        patientId,
        patientName,
        phoneNumber,
        callConfig
      });

      // Build companion-specific prompt content
      const companionPromptContent = `Personal Information: ${personalInfo || "No specific personal information provided"}

This is a companion call focused on general wellbeing and emotional support.
Conversation Style: ${callConfig?.conversationStyle || "friendly"}
Max Duration: ${callConfig?.maxDuration || 15} minutes`;

      console.log("🤝 Preparing companion call with VAPI variable system:", {
        patientName: patientName,
        promptLength: companionPromptContent.length,
        conversationStyle: callConfig?.conversationStyle || "friendly",
        maxDuration: callConfig?.maxDuration || 15
      });

      // Format phone number to E.164 format (based on VAPI documentation)
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

      const formattedPhoneNumber = formatPhoneNumberE164(phoneNumber);
      console.log(`📞 Phone number formatting: ${phoneNumber} → ${formattedPhoneNumber}`);

      // Prepare call request using EXACT format from working triage calls
      const callRequest = {
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || "f412bd32-9764-4d70-94e7-90f87f84ef08",
        customer: {
          number: formattedPhoneNumber
        },
        assistantId: "d289d8be-be92-444e-bb94-b4d25b601f82",
        assistantOverrides: {
          variableValues: {
            patientName: patientName,
            patientAge: 0, // Default age if not available
            patientCondition: "general wellness check",
            patientPrompt: companionPromptContent, // Send raw prompt, let VAPI handle replacement
            conversationHistory: "This is your first conversation with this patient."
          }
        },
        metadata: {
          patientId: patientId,
          patientName: patientName,
          callType: "companion"
        }
      };

      // Check for VAPI keys - try both private and public
      const vapiPrivateKey = process.env.VAPI_PRIVATE_KEY;
      const vapiPublicKey = process.env.VAPI_PUBLIC_KEY;

      if (!vapiPrivateKey && !vapiPublicKey) {
        return res.status(500).json({
          success: false,
          message: "VAPI API key not configured (need either VAPI_PRIVATE_KEY or VAPI_PUBLIC_KEY)"
        });
      }

      // Try private key first, then public key
      const apiKey = vapiPrivateKey || vapiPublicKey;
      const keyType = vapiPrivateKey ? "private" : "public";

      console.log(`🔑 Using VAPI ${keyType} key for companion call`);

      // Make call to VAPI (corrected endpoint)
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
        console.error(`❌ VAPI companion call error (using ${keyType} key):`, {
          status: vapiResponse.status,
          statusText: vapiResponse.statusText,
          error: errorData,
          keyType,
          hasPrivateKey: !!vapiPrivateKey,
          hasPublicKey: !!vapiPublicKey
        });
        throw new Error(errorData.message || "Failed to initiate companion call");
      }

      const callData = await vapiResponse.json();
      console.log("🤝 ✅ Companion call initiated successfully:", callData.id);

      return res.status(200).json({
        success: true,
        message: "Companion call initiated successfully",
        callId: callData.id
      });

    } catch (error) {
      console.error("❌ Error initiating companion call:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to initiate companion call"
      });
    }
  });

  // Get patients for companion calls
  app.get("/api/patients", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      // Get unique patients from patient alerts (which includes all patients)
      const patientPrompts = await storage.getPatientAlerts();
      const uniquePatients = new Map();

      patientPrompts.forEach((patient: any) => {
        if (!uniquePatients.has(patient.patientId)) {
          uniquePatients.set(patient.patientId, {
            id: patient.patientId,
            name: patient.name || patient.patientId.split(' (')[0], // Use name field or extract from ID
            age: patient.age || "Unknown",
            condition: patient.condition || "Unknown",
            phoneNumber: "", // TODO: Add phone number storage
            personalInfo: "" // TODO: Add personal info storage
          });
        }
      });

      const patients = Array.from(uniquePatients.values());

      return res.status(200).json({
        success: true,
        patients
      });

    } catch (error) {
      console.error("❌ Error fetching patients:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch patients"
      });
    }
  });

  // Get current Vapi agent configuration
  app.get("/api/vapi/agent", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const vapiPrivateKey = process.env.VAPI_PRIVATE_KEY;
      if (!vapiPrivateKey) {
        return res.status(500).json({
          success: false,
          message: "Vapi API key not configured"
        });
      }

      const agentId = "d289d8be-be92-444e-bb94-b4d25b601f82";

      // Fetch agent configuration from Vapi
      const vapiResponse = await fetch(`https://api.vapi.ai/assistant/${agentId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${vapiPrivateKey}`
        }
      });

      if (!vapiResponse.ok) {
        const errorData = await vapiResponse.json();
        return res.status(vapiResponse.status).json({
          success: false,
          message: "Failed to fetch agent configuration",
          details: errorData
        });
      }

      const agentData = await vapiResponse.json();

      return res.status(200).json({
        success: true,
        data: agentData
      });

    } catch (error) {
      console.error("Error fetching Vapi agent config:", error);
      return res.status(500).json({
        success: false,
        message: `Error fetching agent config: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  });

  // Update Vapi agent configuration
  app.patch("/api/vapi/agent", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { firstMessage, systemPrompt, voiceProvider, voiceId, model } = req.body;

      const vapiPrivateKey = process.env.VAPI_PRIVATE_KEY;
      if (!vapiPrivateKey) {
        return res.status(500).json({
          success: false,
          message: "Vapi API key not configured"
        });
      }

      const agentId = "d289d8be-be92-444e-bb94-b4d25b601f82";

      // First, get the current agent configuration to preserve existing settings
      const currentAgentResponse = await fetch(`https://api.vapi.ai/assistant/${agentId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${vapiPrivateKey}`
        }
      });

      if (!currentAgentResponse.ok) {
        return res.status(500).json({
          success: false,
          message: "Failed to fetch current agent configuration"
        });
      }

      const currentAgent = await currentAgentResponse.json();

      // Prepare the update payload for Vapi, preserving existing configuration
      const updatePayload: any = {};

      // Only include fields that are being updated
      if (firstMessage !== undefined) {
        updatePayload.firstMessage = firstMessage;
      }

      if (voiceProvider || voiceId) {
        updatePayload.voice = {
          provider: voiceProvider || currentAgent.voice?.provider || "vapi",
          voiceId: voiceId || currentAgent.voice?.voiceId || "Kylie"
        };
      }

      if (systemPrompt || model) {
        // Create a system prompt that uses the complete patient prompt as context
        const enhancedSystemPrompt = systemPrompt || `You are an empathetic AI voice companion conducting a 15-minute check-in call with a patient.

PATIENT INFORMATION:
You are calling {{patientName}}, who is {{patientAge}} years old.

CARE PROMPT CONTEXT:
{{patientPrompt}}

PREVIOUS CONVERSATION HISTORY:
{{conversationHistory}}

INSTRUCTIONS:
- Use the patient's actual name ({{patientName}}) throughout the conversation
- Reference their age ({{patientAge}}) when appropriate
- Reference specific details from the care prompt naturally in your conversation
- Ask how they've been feeling since their last check-in
- Ask open-ended questions to encourage them to share
- If they mention new or worsening symptoms, remind them to contact their care team
- At the end, summarize key points and remind them their care team will follow up
- Be conversational and natural - don't sound robotic or overly clinical

Keep the conversation warm, natural, and personalized based on the care prompt information above.`;

        // Preserve existing model configuration and only update what's specified
        updatePayload.model = {
          provider: "openai",
          model: model || currentAgent.model?.model || "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: enhancedSystemPrompt
            }
          ],
          // Preserve other model settings if they exist
          ...(currentAgent.model?.temperature !== undefined && { temperature: currentAgent.model.temperature }),
          ...(currentAgent.model?.maxTokens !== undefined && { maxTokens: currentAgent.model.maxTokens })
        };
      }

      // Configure webhook URL for call completion events
      if (!updatePayload.server) {
        updatePayload.server = {
          url: `${process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'http://localhost:5000'}/api/vapi/webhook`,
          secret: process.env.VAPI_WEBHOOK_SECRET || "webhook-secret-key"
        };
      }

      // Ensure analysis plan is configured to generate summaries and structured data
      if (!updatePayload.analysisPlan) {
        updatePayload.analysisPlan = {
          summaryPlan: {
            messages: [
              {
                role: "system",
                content: "Summarize this conversation for the patient's caretaker. Focus on the patient's overall mood, any changes in health status, new or ongoing symptoms, and anything else they shared that may be relevant to their care (such as emotional well-being, social interactions, or lifestyle factors). Include any signs of confusion, distress, or unusual behavior. Be concise, objective, and use clear language suitable for a nurse or clinician reviewing patient records. If the patient mentioned any specific requests, concerns, or follow-up needs, highlight them at the end."
              },
              {
                role: "user",
                content: "Here is the transcript:\n\n{{transcript}}\n\n. Here is the ended reason of the call:\n\n{{endedReason}}\n\n"
              }
            ]
          },
          structuredDataPlan: {
            messages: [
              {
                role: "system",
                content: "You are an expert data extractor. You will be given a transcript of a call. Extract structured data per the JSON Schema. DO NOT return anything except the structured data.\n\nJson Schema:\n{{schema}}\n\nOnly respond with the JSON."
              },
              {
                role: "user",
                content: "Here is the transcript:\n\n{{transcript}}\n\n. Here is the ended reason of the call:\n\n{{endedReason}}\n\n"
              }
            ]
          }
        };
      }

      // Note: Variables are passed via assistantOverrides.variableValues during calls,
      // not stored in the assistant configuration itself

      console.log("Vapi update payload:", JSON.stringify(updatePayload, null, 2));

      // Update agent configuration via Vapi API
      const vapiResponse = await fetch(`https://api.vapi.ai/assistant/${agentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${vapiPrivateKey}`
        },
        body: JSON.stringify(updatePayload)
      });

      if (!vapiResponse.ok) {
        const errorText = await vapiResponse.text();
        console.error("Vapi API error:", {
          status: vapiResponse.status,
          statusText: vapiResponse.statusText,
          body: errorText,
          headers: Object.fromEntries(vapiResponse.headers.entries())
        });

        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        return res.status(vapiResponse.status).json({
          success: false,
          message: "Failed to update agent configuration",
          details: errorData,
          vapiError: errorText
        });
      }

      const updatedAgent = await vapiResponse.json();

      return res.status(200).json({
        success: true,
        message: "Agent configuration updated successfully",
        data: updatedAgent
      });

    } catch (error) {
      console.error("Error updating Vapi agent:", error);
      return res.status(500).json({
        success: false,
        message: `Error updating agent: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  });

  // Initiate triage call endpoint
  app.post("/api/vapi/triage-call", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const { patientId, batchId, phoneNumber } = req.body;

      if (!patientId) {
        return res.status(400).json({
          success: false,
          message: "Patient ID is required"
        });
      }

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          message: "Phone number is required"
        });
      }

      console.log("📞 Initiating triage call for patient:", patientId);

      // Get patient data from the database
      const patientPrompt = await storage.getPatientPromptByIds(batchId, patientId);

      if (!patientPrompt) {
        return res.status(404).json({
          success: false,
          message: "Patient not found"
        });
      }

      // Use the phone number from request body (no need to extract from patient data)
      console.log("📞 Using phone number from request:", phoneNumber);

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          message: "No phone number found for this patient"
        });
      }

      // Format phone number for VAPI (E.164 format)
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

      const formattedPhoneNumber = formatPhoneNumberE164(phoneNumber);
      console.log(`📞 Phone number formatting: ${phoneNumber} → ${formattedPhoneNumber}`);

      // Get conversation history for this patient
      const callHistory = await storage.getCallHistoryByPatient(patientId);
      const conversationHistory = callHistory.length > 0
        ? `Previous conversations:\n${callHistory.slice(0, 3).map((call: any) =>
            `${call.callDate}: ${call.summary}`
          ).join('\n')}`
        : "This is your first conversation with this patient.";

      console.log("📞 Preparing triage call with VAPI variable system:", {
        patientName: patientPrompt.name,
        patientAge: patientPrompt.age,
        promptLength: patientPrompt.prompt?.length || 0,
        conversationHistoryLength: conversationHistory.length
      });

      // Prepare call request using VAPI's variable system (no local replacement)
      const callRequest = {
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || "f412bd32-9764-4d70-94e7-90f87f84ef08",
        customer: {
          number: formattedPhoneNumber
        },
        assistantId: "d289d8be-be92-444e-bb94-b4d25b601f82",
        assistantOverrides: {
          variableValues: {
            patientName: patientPrompt.name,
            patientAge: patientPrompt.age || 0,
            patientCondition: "healthcare triage",
            patientPrompt: patientPrompt.prompt, // Send raw prompt, let VAPI handle replacement
            conversationHistory: conversationHistory
          }
        },
        metadata: {
          patientId: patientPrompt.patientId,
          patientName: patientPrompt.name,
          batchId: batchId,
          callType: "triage"
        }
      };

      // Check for VAPI keys
      const vapiPrivateKey = process.env.VAPI_PRIVATE_KEY;
      const vapiPublicKey = process.env.VAPI_PUBLIC_KEY;

      if (!vapiPrivateKey && !vapiPublicKey) {
        return res.status(500).json({
          success: false,
          message: "VAPI API key not configured"
        });
      }

      const apiKey = vapiPrivateKey || vapiPublicKey;
      const keyType = vapiPrivateKey ? "private" : "public";

      console.log(`🔑 Using VAPI ${keyType} key for triage call`);

      // Make call to VAPI (corrected endpoint)
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
        console.error(`❌ VAPI triage call error:`, {
          status: vapiResponse.status,
          statusText: vapiResponse.statusText,
          error: errorData
        });
        throw new Error(errorData.message || "Failed to initiate triage call");
      }

      const callData = await vapiResponse.json();
      console.log("📞 ✅ Triage call initiated successfully:", callData.id);

      return res.status(200).json({
        success: true,
        message: "Triage call initiated successfully",
        callId: callData.id,
        patientName: patientPrompt.name
      });

    } catch (error) {
      console.error("❌ Error initiating triage call:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to initiate triage call"
      });
    }
  });

  // Test call history endpoint - trigger a test webhook to verify call history storage
  app.post("/api/vapi/test-call-history", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      console.log("🧪 Testing call history storage...");

      // Create a test end-of-call-report webhook
      const testWebhook = {
        message: {
          type: "end-of-call-report",
          call: {
            id: "test-call-" + Date.now(),
            startedAt: new Date(Date.now() - 180000).toISOString(), // 3 minutes ago
            endedAt: new Date().toISOString(),
            customer: {
              number: "+17814243027"
            },
            metadata: {
              patientId: "Marie, Gachet",
              patientName: "Marie, Gachet",
              callType: "test"
            }
          },
          transcript: "Hello Marie, this is your healthcare assistant calling to check in. How are you feeling today? I'm doing well, thank you for asking. That's great to hear! Have you been taking your medications as prescribed? Yes, I've been very consistent with them. Excellent! Any new symptoms or concerns since our last conversation? No, everything seems to be going well. Wonderful! Keep up the great work with your health routine.",
          summary: "Routine check-in call with Marie. Patient reports feeling well and maintaining medication compliance. No new symptoms or concerns reported.",
          endedReason: "customer-hangup"
        }
      };

      // Process through webhook handler
      const webhookData = testWebhook;

      if (webhookData.message?.type === "end-of-call-report") {
        const { message } = webhookData;
        const call = message.call;
        const transcript = message.transcript;
        const summary = message.summary;

        console.log("🧪 Processing test end-of-call-report:", {
          callId: call?.id,
          hasTranscript: !!transcript,
          hasSummary: !!summary,
          metadata: call?.metadata
        });

        if (call?.id) {
          // Generate AI-powered conversation summary from transcript
          const aiSummary = await generateConversationSummary(transcript || "", summary);

          // Extract patient info from call metadata
          const patientId = call.metadata?.patientId || "test-patient";
          const patientName = call.metadata?.patientName || "Test Patient";
          const phoneNumber = call.customer?.number || "";

          // Calculate call duration
          const duration = call.endedAt && call.startedAt ?
            Math.floor((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000) : 0;

          // Store call history in database
          const storedCall = await storage.createCallHistory({
            callId: call.id,
            patientId,
            patientName,
            phoneNumber,
            duration,
            status: "completed",
            transcript: transcript || "",
            summary: aiSummary.summary,
            keyPoints: aiSummary.keyPoints,
            healthConcerns: aiSummary.healthConcerns,
            followUpItems: aiSummary.followUpItems,
            callDate: call.endedAt ? new Date(call.endedAt) : new Date()
          });

          console.log(`🧪 ✅ Test call history stored successfully for ${patientName} (${call.id})`);

          return res.status(200).json({
            success: true,
            message: "Test call history created successfully",
            callId: call.id,
            storedCall: storedCall
          });
        }
      }

      return res.status(400).json({
        success: false,
        message: "Failed to process test webhook"
      });

    } catch (error) {
      console.error("🧪 ❌ Error testing call history:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to test call history"
      });
    }
  });

  // Force update VAPI assistant configuration to ensure proper webhook setup
  app.post("/api/vapi/fix-assistant", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const vapiPrivateKey = process.env.VAPI_PRIVATE_KEY;
      if (!vapiPrivateKey) {
        return res.status(500).json({
          success: false,
          message: "Vapi API key not configured"
        });
      }

      const agentId = "d289d8be-be92-444e-bb94-b4d25b601f82";

      console.log("🔧 Fixing VAPI assistant configuration...");

      // Force update the assistant with proper webhook, analysis plan, and correct variable format
      const updatePayload = {
        server: {
          url: `${process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'http://localhost:5000'}/api/vapi/webhook`,
          secret: process.env.VAPI_WEBHOOK_SECRET || "webhook-secret-key"
        },
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a healthcare AI assistant calling {{patientName}}, a {{patientAge}}-year-old patient with {{patientCondition}}.

PATIENT INFORMATION:
- Name: {{patientName}}
- Age: {{patientAge}}
- Primary Condition: {{patientCondition}}

LATEST CARE ASSESSMENT:
{{patientPrompt}}

{{conversationHistory}}

CALL INSTRUCTIONS:
- You are calling on behalf of their healthcare team
- Be warm, professional, and empathetic in your approach
- Address the patient by their name ({{patientName}})
- Reference their specific health condition ({{patientCondition}}) and any concerns mentioned above
- Ask about their current symptoms, medication adherence, and overall well-being
- Provide appropriate health guidance based on their condition and the care assessment
- Offer to schedule follow-up appointments if needed
- Keep the conversation focused on their health but maintain a natural, caring tone
- If they have questions about their condition or treatment, provide helpful information based on the care assessment

IMPORTANT: You have access to their latest health data and personalized care recommendations above. Use this information throughout the conversation to provide relevant, personalized care.`
            }
          ]
        },
        analysisPlan: {
          summaryPlan: {
            messages: [
              {
                role: "system",
                content: "Summarize this conversation for the patient's caretaker. Focus on the patient's overall mood, any changes in health status, new or ongoing symptoms, and anything else they shared that may be relevant to their care (such as emotional well-being, social interactions, or lifestyle factors). Include any signs of confusion, distress, or unusual behavior. Be concise, objective, and use clear language suitable for a nurse or clinician reviewing patient records. If the patient mentioned any specific requests, concerns, or follow-up needs, highlight them at the end."
              },
              {
                role: "user",
                content: "Here is the transcript:\n\n{{transcript}}\n\n. Here is the ended reason of the call:\n\n{{endedReason}}\n\n"
              }
            ]
          },
          structuredDataPlan: {
            messages: [
              {
                role: "system",
                content: "You are an expert data extractor. You will be given a transcript of a call. Extract structured data per the JSON Schema. DO NOT return anything except the structured data.\n\nJson Schema:\n{{schema}}\n\nOnly respond with the JSON."
              },
              {
                role: "user",
                content: "Here is the transcript:\n\n{{transcript}}\n\n. Here is the ended reason of the call:\n\n{{endedReason}}\n\n"
              }
            ]
          }
        }
      };

      console.log("🔧 VAPI assistant update payload:", JSON.stringify(updatePayload, null, 2));

      // Update assistant configuration via Vapi API
      const vapiResponse = await fetch(`https://api.vapi.ai/assistant/${agentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${vapiPrivateKey}`
        },
        body: JSON.stringify(updatePayload)
      });

      if (!vapiResponse.ok) {
        const errorText = await vapiResponse.text();
        console.error("🔧 ❌ Failed to update VAPI assistant:", errorText);
        return res.status(500).json({
          success: false,
          message: `Failed to update VAPI assistant: ${errorText}`
        });
      }

      const updatedAgent = await vapiResponse.json();
      console.log("🔧 ✅ VAPI assistant configuration updated successfully");

      return res.status(200).json({
        success: true,
        message: "VAPI assistant configuration updated successfully",
        agent: updatedAgent
      });

    } catch (error) {
      console.error("🔧 ❌ Error fixing VAPI assistant:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fix VAPI assistant configuration"
      });
    }
  });
}
