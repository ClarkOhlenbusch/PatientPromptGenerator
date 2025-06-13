import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { generateConversationSummary, formatPhoneNumberE164 } from "./vapiHelpers";

export function registerVapiTestRoutes(app: Express): void {
  app.post(
    "/api/vapi/test-call-history",
    async (req: Request, res: Response) => {
      try {
        if (!req.isAuthenticated()) {
          return res.status(401).json({
            success: false,
            message: "Authentication required",
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
                number: "+17814243027",
              },
              metadata: {
                patientId: "Marie, Gachet",
                patientName: "Marie, Gachet",
                callType: "test",
              },
            },
            transcript:
              "Hello Marie, this is your healthcare assistant calling to check in. How are you feeling today? I'm doing well, thank you for asking. That's great to hear! Have you been taking your medications as prescribed? Yes, I've been very consistent with them. Excellent! Any new symptoms or concerns since our last conversation? No, everything seems to be going well. Wonderful! Keep up the great work with your health routine.",
            summary:
              "Routine check-in call with Marie. Patient reports feeling well and maintaining medication compliance. No new symptoms or concerns reported.",
            endedReason: "customer-hangup",
          },
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
            metadata: call?.metadata,
          });

          if (call?.id) {
            // Generate AI-powered conversation summary from transcript
            const aiSummary = await generateConversationSummary(
              transcript || "",
              summary,
            );

            // Extract patient info from call metadata
            const patientId = call.metadata?.patientId || "test-patient";
            const patientName = call.metadata?.patientName || "Test Patient";
            const phoneNumber = call.customer?.number || "";

            // Calculate call duration
            const duration =
              call.endedAt && call.startedAt
                ? Math.floor(
                    (new Date(call.endedAt).getTime() -
                      new Date(call.startedAt).getTime()) /
                      1000,
                  )
                : 0;

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
              callDate: call.endedAt ? new Date(call.endedAt) : new Date(),
            });

            console.log(
              `🧪 ✅ Test call history stored successfully for ${patientName} (${call.id})`,
            );

            return res.status(200).json({
              success: true,
              message: "Test call history created successfully",
              callId: call.id,
              storedCall: storedCall,
            });
          }
        }

        return res.status(400).json({
          success: false,
          message: "Failed to process test webhook",
        });
      } catch (error) {
        console.error("🧪 ❌ Error testing call history:", error);
        return res.status(500).json({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "Failed to test call history",
        });
      }
    },
  );

  // Test call endpoint for Voice Agent prompt testing
  app.post("/api/vapi/test-call", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const {
        phoneNumber,
        firstMessage,
        systemPrompt,
        voiceProvider,
        voiceId,
        model,
      } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          message: "Phone number is required",
        });
      }

      console.log("🧪 Initiating test call:", {
        phoneNumber,
        model: model || "gpt-4o-mini",
        voiceId: voiceId || "Kylie",
        hasSystemPrompt: !!systemPrompt,
      });

      // Check for VAPI keys
      const vapiPrivateKey = process.env.VAPI_PRIVATE_KEY;
      const vapiPublicKey = process.env.VAPI_PUBLIC_KEY;

      if (!vapiPrivateKey && !vapiPublicKey) {
        return res.status(500).json({
          success: false,
          message:
            "VAPI API key not configured (need either VAPI_PRIVATE_KEY or VAPI_PUBLIC_KEY)",
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
          .replace(
            /PATIENT_PROMPT/g,
            "This is a test call to verify your Voice Agent configuration. All patient data in this call is simulated for testing purposes.",
          )
          .replace(
            /CONVERSATION_HISTORY/g,
            "This is your first test conversation to validate prompt settings.",
          );
      }

      // Format phone number to E.164 format
      const formattedPhoneNumber = formatPhoneNumberE164(phoneNumber);
      console.log(
        `📞 Phone number formatting: ${phoneNumber} → ${formattedPhoneNumber}`,
      );

      // Prepare test call request
      const testCallRequest = {
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        customer: {
          number: formattedPhoneNumber,
        },
        assistantId: process.env.VAPI_ASSISTANT_ID, // Using the same assistant ID
        assistantOverrides: {
          firstMessage:
            firstMessage ||
            "Hello, this is a test call from your healthcare AI assistant to verify the Voice Agent configuration. Do you have a moment to speak?",
          model: {
            provider: "openai",
            model: model || "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: enhancedSystemPrompt,
              },
            ],
          },
          voice: {
            provider: voiceProvider || "vapi",
            voiceId: voiceId || "Kylie",
          },
        },
        metadata: {
          callType: "test",
          testCall: true,
          initiatedBy: "prompt-editing-sandbox",
        },
      };

      console.log("🚀 Test call request prepared:", {
        phoneNumber: formattedPhoneNumber,
        assistantId: testCallRequest.assistantId,
        firstMessage: testCallRequest.assistantOverrides.firstMessage,
        model: testCallRequest.assistantOverrides.model.model,
        voice: testCallRequest.assistantOverrides.voice,
        systemPromptLength: enhancedSystemPrompt.length,
      });

      // Make test call to VAPI
      const vapiResponse = await fetch("https://api.vapi.ai/call", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testCallRequest),
      });

      if (!vapiResponse.ok) {
        const errorData = await vapiResponse.json();
        console.error(`❌ VAPI test call error:`, {
          status: vapiResponse.status,
          statusText: vapiResponse.statusText,
          error: errorData,
          keyType,
        });

        return res.status(vapiResponse.status).json({
          success: false,
          message: errorData.message || "Failed to initiate test call",
          vapiError: errorData,
        });
      }

      const callData = await vapiResponse.json();
      console.log("🧪 ✅ Test call initiated successfully:", callData.id);

      return res.status(200).json({
        success: true,
        message: "Test call initiated successfully",
        callId: callData.id,
        phoneNumber: formattedPhoneNumber,
        testCall: true,
      });
    } catch (error) {
      console.error("❌ Error initiating test call:", error);
      return res.status(500).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to initiate test call",
      });
    }
  });

  // Test endpoint for triage context (no auth required for testing)
  app.get(
    "/api/vapi/test-triage-context/:patientId",
    async (req: Request, res: Response) => {
      try {
        const { patientId } = req.params;
        const { batchId } = req.query;

        console.log("🧪 Testing triage context for patient:", patientId);

        // Fetch the patient data (same logic as triage-call endpoint)
        let patientData;
        if (batchId) {
          patientData = await storage.getPatientPromptByIds(
            batchId as string,
            patientId,
          );
        }

        if (!patientData) {
          patientData = await storage.getLatestPatientPrompt(patientId);
        }

        if (!patientData) {
          return res.status(404).json({
            success: false,
            message: `Patient not found: ${patientId}. No triage data available for this patient.`,
          });
        }

        const {
          name: patientName,
          prompt: triagePrompt,
          condition,
          age,
        } = patientData;

        // Get voice agent template and create enhanced system prompt
        const voiceAgentTemplate = await storage.getVoiceAgentTemplate();
        let enhancedSystemPrompt = voiceAgentTemplate;

        enhancedSystemPrompt = enhancedSystemPrompt
          .replace(/PATIENT_NAME/g, patientName || patientId)
          .replace(/PATIENT_AGE/g, age?.toString() || "unknown age")
          .replace(
            /PATIENT_CONDITION/g,
            condition || "general health assessment",
          )
          .replace(
            /PATIENT_PROMPT/g,
            triagePrompt || "No specific care assessment available",
          )
          .replace(
            /CONVERSATION_HISTORY/g,
            "This is your first conversation with this patient.",
          );

        // Get comprehensive call history context for enhanced patient continuity
        const callHistoryContext = await storage.getCallHistoryContext(
          patientId,
          5,
        );
        enhancedSystemPrompt = enhancedSystemPrompt.replace(
          /CONVERSATION_HISTORY/g,
          callHistoryContext.contextText,
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
            contextInjectionWorking: true,
          },
        });
      } catch (error) {
        console.error("❌ Error testing triage context:", error);
        return res.status(500).json({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "Failed to test triage context",
        });
      }
    },
  );
}

