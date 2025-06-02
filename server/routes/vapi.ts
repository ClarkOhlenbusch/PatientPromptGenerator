import { Express, Request, Response } from "express";
import { storage } from "../storage";
import OpenAI from "openai";
import { ParsedQs } from "qs";

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

// Helper function to format phone number to E.164 format
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

// Helper function to store call history, to be used by both direct and delayed paths
async function storeCallHistoryWithDetails(
  callId: string,
  patientId: string,
  patientName: string,
  phoneNumber: string,
  durationSeconds: number,
  callStatusReason: string,
  transcript: string | null,
  vapiSummary: string | null,
  callEndTimeISO: string,
  callMetadata?: any,
  source?: string // Added for debugging which path stored it
) {
  try {
    console.log(`💾 Storing call history for ${callId} from source: ${source || 'unknown'}. Duration: ${durationSeconds}s`);
    // Generate AI-powered conversation summary from transcript
    const aiSummary = await generateConversationSummary(transcript || "", vapiSummary || undefined);

    // Determine call status based on end reason
    let finalCallStatus = "completed";
    if (callStatusReason) {
      switch (callStatusReason.toLowerCase()) {
        case "customer-hangup":
        case "assistant-hangup":
        case "customer-ended-call": // Added this one from Vapi API
        case "ended": // Generic ended status
          finalCallStatus = "completed";
          break;
        case "customer-did-not-answer":
        case "no-answer-machine-detected":
        case "no-answer-human-detected":
          finalCallStatus = "no-answer";
          break;
        case "customer-busy":
          finalCallStatus = "busy";
          break;
        case "error":
        case "failed": // Generic failed
          finalCallStatus = "failed";
          break;
        default:
          // Use the reason directly if it's not one of the common ones
          // but try to keep it reasonably short if it's a long description
          finalCallStatus = callStatusReason.substring(0, 50); 
      }
    }
    
    const patientInfoFromMeta = callMetadata?.patientId ? {
        patientId: callMetadata.patientId,
        patientName: callMetadata.patientName || patientName,
    } : { patientId, patientName};


    await storage.createCallHistory({
      callId,
      patientId: patientInfoFromMeta.patientId,
      patientName: patientInfoFromMeta.patientName,
      phoneNumber,
      duration: durationSeconds,
      status: finalCallStatus,
      transcript: transcript || "",
      summary: aiSummary.summary,
      keyPoints: aiSummary.keyPoints,
      healthConcerns: aiSummary.healthConcerns,
      followUpItems: aiSummary.followUpItems,
      callDate: new Date(callEndTimeISO) // Use the provided end time
    });

    console.log(`✅ Stored call history for patient ${patientInfoFromMeta.patientName} (${callId}), Duration: ${durationSeconds}s, Status: ${finalCallStatus}`);
  } catch (storageError) {
    console.error(`❌ Call ${callId}: Error storing call history:`, storageError);
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
      // console.log("🎯 Webhook body:", JSON.stringify(req.body, null, 2)); // Keep this commented unless deep debugging body

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

      // Handle end-of-call-report event
      if (webhookData.message?.type === "end-of-call-report") {
        const { message } = webhookData;
        const call = message.call;
        const transcript = message.transcript;
        const summary = message.summary; // Vapi's own summary, if provided

        console.log("🔎 VAPI Call Object (from webhook):", {
          callId: call?.id,
          startedAt: call?.startedAt,
          endedAt: call?.endedAt,
          createdAt: call?.createdAt, // Log if present in webhook
          updatedAt: call?.updatedAt, // Log if present in webhook
          type: call?.type,
          status: call?.status,
          endedReason: message?.endedReason,
          metadata: call?.metadata
        });

        if (call?.id) {
          const callId = call.id;
          const patientId = call.metadata?.patientId || "unknown";
          const patientName = call.metadata?.patientName || "Unknown Patient";
          const phoneNumber = call.customer?.number || "";
          const callEndedReason = message?.endedReason || call?.status || "unknown";

          // Attempt to calculate duration from webhook payload directly
          const callStartedAtEpoch = call.startedAt ? new Date(call.startedAt).getTime() : 0;
          const callEndedAtEpoch = call.endedAt ? new Date(call.endedAt).getTime() : 0;
          let calculatedDurationSeconds = 0;
          let usedDirectTimestamps = false;

          if (callEndedAtEpoch > 0 && callStartedAtEpoch > 0 && callEndedAtEpoch > callStartedAtEpoch) {
            calculatedDurationSeconds = Math.floor((callEndedAtEpoch - callStartedAtEpoch) / 1000);
            usedDirectTimestamps = true;
            console.log(`⏱️ Duration from webhook: ${calculatedDurationSeconds}s (startedAt: ${call.startedAt}, endedAt: ${call.endedAt})`);
          } else {
            console.warn(`⚠️ Call ${callId}: Webhook timestamps unusable (status: ${call?.status}). Deferred fetch initiated.`);
          }

          // If direct timestamps were NOT usable, schedule a delayed fetch and return early.
          if (!usedDirectTimestamps) {
            // Non-blocking: Acknowledge webhook quickly, process storage in background.
            res.status(200).json({ success: true, message: "Webhook acknowledged, processing call details via deferred fetch." });

            // Start delayed processing.
            setTimeout(async () => {
              try {
                console.log(`⏳ Call ${callId}: Starting delayed fetch for complete call details (10s delay).`);
                const vapiToken = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || "19ae21bd-8010-47ab-bd79-2a3c1e71e447";
                const vapiCallDetailsResponse = await fetch(`https://api.vapi.ai/call/${callId}`, {
                  method: "GET",
                  headers: {
                    "Authorization": `Bearer ${vapiToken}`,
                    "Content-Type": "application/json"
                  }
                });

                if (!vapiCallDetailsResponse.ok) {
                  const errorText = await vapiCallDetailsResponse.text();
                  console.error(`❌ Call ${callId} (deferred fetch): Error fetching call details from Vapi API: ${vapiCallDetailsResponse.status} - ${errorText}`);
                  await storeCallHistoryWithDetails(callId, patientId, patientName, phoneNumber, 0, callEndedReason, transcript, summary, call.endedAt || new Date().toISOString(), call.metadata, "deferred_fetch_api_error");
                  return;
                }

                const callDetails = await vapiCallDetailsResponse.json();
                console.log(`📊 Call ${callId} (deferred fetch): Fetched call details from Vapi API:`, {
                  id: callDetails.id, createdAt: callDetails.createdAt, updatedAt: callDetails.updatedAt,
                  status: callDetails.status, endedReason: callDetails.endedReason,
                  startedAt: callDetails.startedAt, endedAt: callDetails.endedAt
                });
                
                let finalDurationSeconds = 0;
                const fetchedStartedAt = callDetails.startedAt ? new Date(callDetails.startedAt).getTime() : 0;
                const fetchedEndedAt = callDetails.endedAt ? new Date(callDetails.endedAt).getTime() : 0;

                if (fetchedEndedAt > 0 && fetchedStartedAt > 0 && fetchedEndedAt > fetchedStartedAt) {
                  finalDurationSeconds = Math.floor((fetchedEndedAt - fetchedStartedAt) / 1000);
                  console.log(`⏱️ Call ${callId} (deferred fetch): Duration from Vapi API (startedAt/endedAt): ${finalDurationSeconds}s`);
                } else if (callDetails.createdAt && callDetails.updatedAt) {
                  const createdAtEpoch = new Date(callDetails.createdAt).getTime();
                  const updatedAtEpoch = new Date(callDetails.updatedAt).getTime();
                  if (updatedAtEpoch > createdAtEpoch) {
                    finalDurationSeconds = Math.floor((updatedAtEpoch - createdAtEpoch) / 1000);
                    console.log(`⏱️ Call ${callId} (deferred fetch): Duration from Vapi API (createdAt/updatedAt): ${finalDurationSeconds}s`);
                  } else {
                     console.warn(`⚠️ Call ${callId} (deferred fetch): Vapi API updatedAt (${callDetails.updatedAt}) not after createdAt (${callDetails.createdAt}). Using 0 duration.`);
                  }
                } else {
                  console.warn(`⚠️ Call ${callId} (deferred fetch): Vapi API also missing sufficient timestamps. Using 0 duration.`);
                }
                
                await storeCallHistoryWithDetails(callId, patientId, patientName, phoneNumber, finalDurationSeconds, callDetails.endedReason || callEndedReason, transcript, summary, callDetails.endedAt || callDetails.updatedAt || new Date().toISOString(), callDetails.metadata, "deferred_fetch_success");

              } catch (fetchError) {
                console.error(`❌ Call ${callId} (deferred fetch): Exception during delayed fetch/store:`, fetchError);
                 await storeCallHistoryWithDetails(callId, patientId, patientName, phoneNumber, 0, callEndedReason, transcript, summary, call.endedAt || new Date().toISOString(), call.metadata, "deferred_fetch_exception");
              }
            }, 10000); // 10-second delay.

            return; // CRITICAL: Ensures no further code in this handler runs for this request.
          } else {
            // This block is for when webhook timestamps ARE usable.
            console.log(`✅ Call ${callId}: Using direct webhook timestamps for duration calculation.`);
            await storeCallHistoryWithDetails(callId, patientId, patientName, phoneNumber, calculatedDurationSeconds, callEndedReason, transcript, summary, call.endedAt!, call.metadata, "direct_webhook_timestamps");
            return res.status(200).json({ success: true });
          }
        } else {
           console.warn("⚠️ Webhook end-of-call-report missing call.id");
           return res.status(400).json({ success: false, message: "Missing call ID in webhook" });
        }
      } else if (webhookData.message?.type) {
        // For other message types, just acknowledge
        // console.log(`✅ Other webhook type ${webhookData.message.type} acknowledged.`);
        return res.status(200).json({ success: true, message: "Webhook acknowledged" });
      } else {
        console.warn("⚠️ Unknown or malformed webhook structure received.");
        return res.status(400).json({ success: false, message: "Malformed webhook" });
      }

      // Fallthrough for any case not handled above (e.g. no message type)
      // This line should ideally not be reached if all webhook types are handled or acknowledged.
      // console.log("✅ Webhook processed (default acknowledgement)");
      // return res.status(200).json({ success: true }); // This was causing issues, removed in favor of specific returns.

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
      if (error instanceof Error) {
        console.error("🧪 Error stack:", error.stack);
        return res.status(500).json({
          success: false,
          message: "Error processing test webhook",
          error: error.message
        });
      }
      return res.status(500).json({
        success: false,
        message: "Error processing test webhook",
        error: "Unknown error"
      });
    }
  });

  // NEW: Enhanced triage call endpoint with patient context injection
  app.post("/api/vapi/triage-call", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const { patientId, phoneNumber, batchId, callConfig } = req.body;

      if (!patientId || !phoneNumber) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: patientId, phoneNumber"
        });
      }

      console.log("🏥 Initiating context-aware call:", {
        patientId,
        phoneNumber,
        batchId,
        callConfig
      });

      // Fetch the latest patient prompt data from the database
      let patientData;
      if (batchId) {
        // Try specific batch first
        patientData = await storage.getPatientPromptByIds(batchId, patientId);
      }
      
      // If no batch-specific data found, get latest across all batches
      if (!patientData) {
        patientData = await storage.getLatestPatientPrompt(patientId);
      }

      if (!patientData) {
        return res.status(404).json({
          success: false,
          message: `Patient not found: ${patientId}. No triage data available for this patient.`
        });
      }

      console.log("🔍 Retrieved patient triage data:", {
        promptId: patientData.id,
        patientId: patientData.patientId,
        batchId: patientData.batchId,
        promptLength: patientData.prompt?.length || 0,
        hasRawData: !!patientData.rawData
      });

      const { name: patientName, prompt: triagePrompt, condition, age } = patientData;

      // Get voice agent template for proper formatting
      const voiceAgentTemplate = await storage.getVoiceAgentTemplate();

      // Create enhanced system prompt by replacing template variables with actual patient data
      let enhancedSystemPrompt = voiceAgentTemplate;
      
      enhancedSystemPrompt = enhancedSystemPrompt
        .replace(/PATIENT_NAME/g, patientName || patientId)
        .replace(/PATIENT_AGE/g, age?.toString() || "unknown age")
        .replace(/PATIENT_CONDITION/g, condition || "general health assessment")
        .replace(/PATIENT_PROMPT/g, triagePrompt || "No specific care assessment available")
        .replace(/CONVERSATION_HISTORY/g, "This is your first conversation with this patient.");

      // Get comprehensive call history context for enhanced patient continuity
      const callHistoryContext = await storage.getCallHistoryContext(patientId as string, 5);
      enhancedSystemPrompt = enhancedSystemPrompt.replace(
        /CONVERSATION_HISTORY/g, 
        callHistoryContext.contextText
      );

      console.log("🎯 Enhanced system prompt prepared:", {
        templateLength: voiceAgentTemplate.length,
        finalLength: enhancedSystemPrompt.length,
        hasCallHistory: callHistoryContext.hasHistory,
        recentCallsCount: callHistoryContext.recentCalls,
        contextLength: callHistoryContext.contextText.length
      });

      const formattedPhoneNumber = formatPhoneNumberE164(phoneNumber);
      console.log(`📞 Phone number formatting: ${phoneNumber} → ${formattedPhoneNumber}`);

      // Prepare call request with enhanced system prompt
      const callRequest = {
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || "f412bd32-9764-4d70-94e7-90f87f84ef08",
        customer: {
          number: formattedPhoneNumber
        },
        assistantId: "d289d8be-be92-444e-bb94-b4d25b601f82",
        assistantOverrides: {
          // Primary method: Complete system prompt override with patient data injected
          model: {
            provider: "openai",
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: enhancedSystemPrompt
              }
            ]
          },
          // Backup method: Variable values for template replacement
          variableValues: {
            patientName: patientName || patientId,
            patientAge: age || 0,
            patientCondition: condition || "general health assessment",
            patientPrompt: triagePrompt || "No specific care assessment available",
            conversationHistory: callHistoryContext.contextText
          }
        },
        metadata: {
          patientId: patientData.patientId,
          patientName: patientName,
          callType: "context-aware",
          hasContext: true,
          batchId: patientData.batchId
        }
      };

      console.log("🚀 Final call request prepared:", {
        phoneNumber: formattedPhoneNumber,
        assistantId: callRequest.assistantId,
        hasSystemPrompt: !!callRequest.assistantOverrides.model.messages[0].content,
        systemPromptLength: callRequest.assistantOverrides.model.messages[0].content.length,
        hasVariableValues: !!callRequest.assistantOverrides.variableValues,
        metadata: callRequest.metadata
      });

      // Check for VAPI keys
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

      console.log(`🔑 Using VAPI ${keyType} key for context-aware call`);

      // Make call to VAPI
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
        console.error(`❌ VAPI context-aware call error:`, {
          status: vapiResponse.status,
          statusText: vapiResponse.statusText,
          error: errorData,
          keyType
        });
        
        return res.status(vapiResponse.status).json({
          success: false,
          message: errorData.message || "Failed to initiate context-aware call",
          vapiError: errorData
        });
      }

      const callData = await vapiResponse.json();
      console.log("🏥 ✅ Context-aware call initiated successfully:", callData.id);

      return res.status(200).json({
        success: true,
        message: "Call initiated successfully with full patient context",
        callId: callData.id,
        patientName: patientName,
        hasContext: true
      });

    } catch (error) {
      console.error("❌ Error initiating context-aware call:", error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to initiate context-aware call"
      });
    }
  });

  // Unified call endpoint - replaces both companion and triage calls  
  app.post("/api/vapi/call", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const { patientId, phoneNumber, batchId, callConfig, callType = "context-aware" } = req.body;

      if (!patientId || !phoneNumber) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: patientId, phoneNumber"
        });
      }

      console.log("📞 Initiating unified call:", {
        patientId,
        phoneNumber,
        batchId,
        callConfig,
        callType
      });

      // Always fetch patient context data (unified approach)
      let patientData;
      if (batchId) {
        // Try specific batch first
        patientData = await storage.getPatientPromptByIds(batchId, patientId);
      }
      
      // If no batch-specific data found, get latest across all batches
      if (!patientData) {
        patientData = await storage.getLatestPatientPrompt(patientId);
      }

      if (!patientData) {
        return res.status(404).json({
          success: false,
          message: `Patient not found: ${patientId}. No patient data available for this patient.`
        });
      }

      console.log("🔍 Retrieved patient data:", {
        promptId: patientData.id,
        patientId: patientData.patientId,
        batchId: patientData.batchId,
        promptLength: patientData.prompt?.length || 0,
        hasRawData: !!patientData.rawData
      });

      const { name: patientName, prompt: triagePrompt, condition, age } = patientData;

      // Get voice agent template for proper formatting
      const voiceAgentTemplate = await storage.getVoiceAgentTemplate();

      // Create enhanced system prompt by replacing template variables with actual patient data
      let enhancedSystemPrompt = voiceAgentTemplate;
      
      enhancedSystemPrompt = enhancedSystemPrompt
        .replace(/PATIENT_NAME/g, patientName || patientId)
        .replace(/PATIENT_AGE/g, age?.toString() || "unknown age")
        .replace(/PATIENT_CONDITION/g, condition || "general health assessment")
        .replace(/PATIENT_PROMPT/g, triagePrompt || "No specific care assessment available")
        .replace(/CONVERSATION_HISTORY/g, "This is your first conversation with this patient.");

      // Get comprehensive call history context for enhanced patient continuity
      const callHistoryContext = await storage.getCallHistoryContext(patientId as string, 5);
      enhancedSystemPrompt = enhancedSystemPrompt.replace(
        /CONVERSATION_HISTORY/g, 
        callHistoryContext.contextText
      );

      console.log("🎯 Enhanced system prompt prepared:", {
        templateLength: voiceAgentTemplate.length,
        finalLength: enhancedSystemPrompt.length,
        hasCallHistory: callHistoryContext.hasHistory,
        recentCallsCount: callHistoryContext.recentCalls,
        contextLength: callHistoryContext.contextText.length
      });

      const formattedPhoneNumber = formatPhoneNumberE164(phoneNumber);
      console.log(`📞 Phone number formatting: ${phoneNumber} → ${formattedPhoneNumber}`);

      // Prepare call request with enhanced system prompt
      const callRequest = {
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || "f412bd32-9764-4d70-94e7-90f87f84ef08",
        customer: {
          number: formattedPhoneNumber
        },
        assistantId: "d289d8be-be92-444e-bb94-b4d25b601f82",
        assistantOverrides: {
          // Primary method: Complete system prompt override with patient data injected
          model: {
            provider: "openai",
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: enhancedSystemPrompt
              }
            ]
          },
          // Backup method: Variable values for template replacement
          variableValues: {
            patientName: patientName || patientId,
            patientAge: age || 0,
            patientCondition: condition || "general health assessment",
            patientPrompt: triagePrompt || "No specific care assessment available",
            conversationHistory: callHistoryContext.contextText
          }
        },
        metadata: {
          patientId: patientData.patientId,
          patientName: patientName,
          callType: callType,
          hasContext: true,
          batchId: patientData.batchId
        }
      };

      console.log("🚀 Final call request prepared:", {
        phoneNumber: formattedPhoneNumber,
        assistantId: callRequest.assistantId,
        hasSystemPrompt: !!callRequest.assistantOverrides.model.messages[0].content,
        systemPromptLength: callRequest.assistantOverrides.model.messages[0].content.length,
        hasVariableValues: !!callRequest.assistantOverrides.variableValues,
        metadata: callRequest.metadata
      });

      // Check for VAPI keys
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

      console.log(`🔑 Using VAPI ${keyType} key for unified call`);

      // Make call to VAPI
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
        console.error(`❌ VAPI unified call error:`, {
          status: vapiResponse.status,
          statusText: vapiResponse.statusText,
          error: errorData,
          keyType
        });
        
        return res.status(vapiResponse.status).json({
          success: false,
          message: errorData.message || "Failed to initiate unified call",
          vapiError: errorData
        });
      }

      const callData = await vapiResponse.json();
      console.log("📞 ✅ Unified call initiated successfully:", callData.id);

      return res.status(200).json({
        success: true,
        message: "Call initiated successfully with full patient context",
        callId: callData.id,
        patientName: patientName,
        hasContext: true,
        callType: callType
      });

    } catch (error) {
      console.error("❌ Error initiating unified call:", error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to initiate unified call"
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
            name: patient.patientName || patient.name || patient.patientId, // Use patientName field first
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

  // Get triage context preview for a patient
  app.get("/api/vapi/triage-context", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const { patientId, batchId } = req.query;

      if (!patientId) {
        return res.status(400).json({
          success: false,
          message: "Patient ID is required"
        });
      }

      // Fetch the patient data (same logic as triage-call endpoint)
      let patientData;
      if (batchId) {
        patientData = await storage.getPatientPromptByIds(batchId as string, String(patientId));
      }
      
      if (!patientData) {
        patientData = await storage.getLatestPatientPrompt(String(patientId));
      }

      if (!patientData) {
        return res.status(404).json({
          success: false,
          message: `Patient not found: ${patientId}. No triage data available for this patient.`
        });
      }

      const { name: patientName, prompt: triagePrompt, condition, age } = patientData;

      // Get voice agent template and create enhanced system prompt (same as triage-call)
      const voiceAgentTemplate = await storage.getVoiceAgentTemplate();
      let enhancedSystemPrompt = voiceAgentTemplate;
      
      enhancedSystemPrompt = enhancedSystemPrompt
        .replace(/PATIENT_NAME/g, patientName || String(patientId))
        .replace(/PATIENT_AGE/g, age?.toString() || "unknown age")
        .replace(/PATIENT_CONDITION/g, condition || "general health assessment")
        .replace(/PATIENT_PROMPT/g, triagePrompt || "No specific care assessment available")
        .replace(/CONVERSATION_HISTORY/g, "This is your first conversation with this patient.");

      // Get comprehensive call history context for enhanced patient continuity
      const callHistoryContext = await storage.getCallHistoryContext(String(patientId), 5);
      enhancedSystemPrompt = enhancedSystemPrompt.replace(
        /CONVERSATION_HISTORY/g, 
        callHistoryContext.contextText
      );

      return res.status(200).json({
        success: true,
        data: {
          patientId: patientData.patientId,
          name: patientName,
          age: age,
          condition: condition,
          batchId: patientData.batchId,
          triagePrompt: triagePrompt,
          triagePromptLength: triagePrompt?.length || 0,
          hasRecentCall: !!callHistoryContext,
          recentCallSummary: callHistoryContext.contextText,
          enhancedSystemPrompt: enhancedSystemPrompt,
          systemPromptLength: enhancedSystemPrompt.length
        }
      });

    } catch (error) {
      console.error("❌ Error fetching triage context:", error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to fetch triage context"
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
        message: error instanceof Error ? error.message : "Failed to test call history"
      });
    }
  });

  // Test call endpoint for Voice Agent prompt testing
  app.post("/api/vapi/test-call", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const { phoneNumber, firstMessage, systemPrompt, voiceProvider, voiceId, model } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          message: "Phone number is required"
        });
      }

      console.log("🧪 Initiating test call:", {
        phoneNumber,
        model: model || "gpt-4o-mini",
        voiceId: voiceId || "Kylie",
        hasSystemPrompt: !!systemPrompt
      });

      // Check for VAPI keys
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

      console.log(`🔑 Using VAPI ${keyType} key for test call`);

      // Get the current Voice Agent template if no custom system prompt provided
      let enhancedSystemPrompt = systemPrompt;
      if (!enhancedSystemPrompt) {
        const voiceAgentTemplate = await storage.getVoiceAgentTemplate();
        
        // Create mock test patient data for template testing
        enhancedSystemPrompt = voiceAgentTemplate
          .replace(/PATIENT_NAME/g, "Test Patient")
          .replace(/PATIENT_AGE/g, "65")
          .replace(/PATIENT_CONDITION/g, "routine health check")
          .replace(/PATIENT_PROMPT/g, "This is a test call to verify your Voice Agent configuration. All patient data in this call is simulated for testing purposes.")
          .replace(/CONVERSATION_HISTORY/g, "This is your first test conversation to validate prompt settings.");
      }

      // Format phone number to E.164 format
      const formattedPhoneNumber = formatPhoneNumberE164(phoneNumber);
      console.log(`📞 Phone number formatting: ${phoneNumber} → ${formattedPhoneNumber}`);

      // Prepare test call request
      const testCallRequest = {
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || "f412bd32-9764-4d70-94e7-90f87f84ef08",
        customer: {
          number: formattedPhoneNumber
        },
        assistantId: "d289d8be-be92-444e-bb94-b4d25b601f82", // Using the same assistant ID
        assistantOverrides: {
          firstMessage: firstMessage || "Hello, this is a test call from your healthcare AI assistant to verify the Voice Agent configuration. Do you have a moment to speak?",
          model: {
            provider: "openai",
            model: model || "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: enhancedSystemPrompt
              }
            ]
          },
          voice: {
            provider: voiceProvider || "vapi",
            voiceId: voiceId || "Kylie"
          }
        },
        metadata: {
          callType: "test",
          testCall: true,
          initiatedBy: "prompt-editing-sandbox"
        }
      };

      console.log("🚀 Test call request prepared:", {
        phoneNumber: formattedPhoneNumber,
        assistantId: testCallRequest.assistantId,
        firstMessage: testCallRequest.assistantOverrides.firstMessage,
        model: testCallRequest.assistantOverrides.model.model,
        voice: testCallRequest.assistantOverrides.voice,
        systemPromptLength: enhancedSystemPrompt.length
      });

      // Make test call to VAPI
      const vapiResponse = await fetch("https://api.vapi.ai/call", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(testCallRequest)
      });

      if (!vapiResponse.ok) {
        const errorData = await vapiResponse.json();
        console.error(`❌ VAPI test call error:`, {
          status: vapiResponse.status,
          statusText: vapiResponse.statusText,
          error: errorData,
          keyType
        });
        
        return res.status(vapiResponse.status).json({
          success: false,
          message: errorData.message || "Failed to initiate test call",
          vapiError: errorData
        });
      }

      const callData = await vapiResponse.json();
      console.log("🧪 ✅ Test call initiated successfully:", callData.id);

      return res.status(200).json({
        success: true,
        message: "Test call initiated successfully",
        callId: callData.id,
        phoneNumber: formattedPhoneNumber,
        testCall: true
      });

    } catch (error) {
      console.error("❌ Error initiating test call:", error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to initiate test call"
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
        message: error instanceof Error ? error.message : "Failed to fix VAPI assistant configuration"
      });
    }
  });

  // Test endpoint for triage context (no auth required for testing)
  app.get("/api/vapi/test-triage-context/:patientId", async (req: Request, res: Response) => {
    try {
      const { patientId } = req.params;
      const { batchId } = req.query;

      console.log("🧪 Testing triage context for patient:", patientId);

      // Fetch the patient data (same logic as triage-call endpoint)
      let patientData;
      if (batchId) {
        patientData = await storage.getPatientPromptByIds(batchId as string, patientId);
      }
      
      if (!patientData) {
        patientData = await storage.getLatestPatientPrompt(patientId);
      }

      if (!patientData) {
        return res.status(404).json({
          success: false,
          message: `Patient not found: ${patientId}. No triage data available for this patient.`
        });
      }

      const { name: patientName, prompt: triagePrompt, condition, age } = patientData;

      // Get voice agent template and create enhanced system prompt
      const voiceAgentTemplate = await storage.getVoiceAgentTemplate();
      let enhancedSystemPrompt = voiceAgentTemplate;
      
      enhancedSystemPrompt = enhancedSystemPrompt
        .replace(/PATIENT_NAME/g, patientName || patientId)
        .replace(/PATIENT_AGE/g, age?.toString() || "unknown age")
        .replace(/PATIENT_CONDITION/g, condition || "general health assessment")
        .replace(/PATIENT_PROMPT/g, triagePrompt || "No specific care assessment available")
        .replace(/CONVERSATION_HISTORY/g, "This is your first conversation with this patient.");

      // Get comprehensive call history context for enhanced patient continuity
      const callHistoryContext = await storage.getCallHistoryContext(patientId, 5);
      enhancedSystemPrompt = enhancedSystemPrompt.replace(
        /CONVERSATION_HISTORY/g, 
        callHistoryContext.contextText
      );

      return res.status(200).json({
        success: true,
        message: "Triage context test successful",
        data: {
          patientId: patientData.patientId,
          name: patientName,
          age: age,
          condition: condition,
          batchId: patientData.batchId,
          triagePrompt: triagePrompt,
          triagePromptLength: triagePrompt?.length || 0,
          hasRecentCall: !!callHistoryContext,
          recentCallSummary: callHistoryContext.contextText,
          enhancedSystemPrompt: enhancedSystemPrompt,
          systemPromptLength: enhancedSystemPrompt.length,
          contextInjectionWorking: true
        }
      });

    } catch (error) {
      console.error("❌ Error testing triage context:", error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to test triage context"
      });
    }
  });
}
