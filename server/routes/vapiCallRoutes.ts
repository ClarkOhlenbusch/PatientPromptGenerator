import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { formatPhoneNumberE164 } from "./vapiHelpers";

export function registerVapiCallRoutes(app: Express): void {
  app.post("/api/vapi/triage-call", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const { patientId, phoneNumber, batchId, callConfig } = req.body;

      if (!patientId || !phoneNumber) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: patientId, phoneNumber",
        });
      }

      console.log("🏥 Initiating context-aware call:", {
        patientId,
        phoneNumber,
        batchId,
        callConfig,
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
          message: `Patient not found: ${patientId}. No triage data available for this patient.`,
        });
      }

      console.log("🔍 Retrieved patient triage data:", {
        promptId: patientData.id,
        patientId: patientData.patientId,
        batchId: patientData.batchId,
        promptLength: patientData.prompt?.length || 0,
        hasRawData: !!patientData.rawData,
      });

      const {
        name: patientName,
        prompt: triagePrompt,
        condition,
        age,
      } = patientData;

      // Get voice agent template for proper formatting
      const voiceAgentTemplate = await storage.getVoiceAgentTemplate();

      // Create enhanced system prompt by replacing template variables with actual patient data
      let enhancedSystemPrompt = voiceAgentTemplate;

      enhancedSystemPrompt = enhancedSystemPrompt
        .replace(/PATIENT_NAME/g, patientName || patientId)
        .replace(/PATIENT_AGE/g, age?.toString() || "unknown age")
        .replace(/PATIENT_CONDITION/g, condition || "general health assessment")
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
        patientId as string,
        5,
      );
      enhancedSystemPrompt = enhancedSystemPrompt.replace(
        /CONVERSATION_HISTORY/g,
        callHistoryContext.contextText,
      );

      console.log("🎯 Enhanced system prompt prepared:", {
        templateLength: voiceAgentTemplate.length,
        finalLength: enhancedSystemPrompt.length,
        hasCallHistory: callHistoryContext.hasHistory,
        recentCallsCount: callHistoryContext.recentCalls,
        contextLength: callHistoryContext.contextText.length,
      });

      const formattedPhoneNumber = formatPhoneNumberE164(phoneNumber);
      console.log(
        `📞 Phone number formatting: ${phoneNumber} → ${formattedPhoneNumber}`,
      );

      // Prepare call request with enhanced system prompt
      const callRequest = {
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        customer: {
          number: formattedPhoneNumber,
        },
        assistantId: process.env.VAPI_ASSISTANT_ID,
        assistantOverrides: {
          // Primary method: Complete system prompt override with patient data injected
          model: {
            provider: "openai",
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: enhancedSystemPrompt,
              },
            ],
          },
          // Backup method: Variable values for template replacement
          variableValues: {
            patientName: patientName || patientId,
            patientAge: age || 0,
            patientCondition: condition || "general health assessment",
            patientPrompt:
              triagePrompt || "No specific care assessment available",
            conversationHistory: callHistoryContext.contextText,
          },
        },
        metadata: {
          patientId: patientData.patientId,
          patientName: patientName,
          callType: "context-aware",
          hasContext: true,
          batchId: patientData.batchId,
        },
      };

      console.log("🚀 Final call request prepared:", {
        phoneNumber: formattedPhoneNumber,
        assistantId: callRequest.assistantId,
        hasSystemPrompt:
          !!callRequest.assistantOverrides.model.messages[0].content,
        systemPromptLength:
          callRequest.assistantOverrides.model.messages[0].content.length,
        hasVariableValues: !!callRequest.assistantOverrides.variableValues,
        metadata: callRequest.metadata,
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

      console.log(`🔑 Using VAPI ${keyType} key for context-aware call`);

      // Make call to VAPI
      const vapiResponse = await fetch("https://api.vapi.ai/call", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(callRequest),
      });

      if (!vapiResponse.ok) {
        const errorData = await vapiResponse.json();
        console.error(`❌ VAPI context-aware call error:`, {
          status: vapiResponse.status,
          statusText: vapiResponse.statusText,
          error: errorData,
          keyType,
        });

        return res.status(vapiResponse.status).json({
          success: false,
          message: errorData.message || "Failed to initiate context-aware call",
          vapiError: errorData,
        });
      }

      const callData = await vapiResponse.json();
      console.log(
        "🏥 ✅ Context-aware call initiated successfully:",
        callData.id,
      );

      return res.status(200).json({
        success: true,
        message: "Call initiated successfully with full patient context",
        callId: callData.id,
        patientName: patientName,
        hasContext: true,
      });
    } catch (error) {
      console.error("❌ Error initiating context-aware call:", error);
      return res.status(500).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to initiate context-aware call",
      });
    }
  });

  // Unified call endpoint - replaces both companion and triage calls
  app.post("/api/vapi/call", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const {
        patientId,
        phoneNumber,
        batchId,
        callConfig,
        callType = "context-aware",
      } = req.body;

      if (!patientId || !phoneNumber) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: patientId, phoneNumber",
        });
      }

      console.log("📞 Initiating unified call:", {
        patientId,
        phoneNumber,
        batchId,
        callConfig,
        callType,
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
          message: `Patient not found: ${patientId}. No patient data available for this patient.`,
        });
      }

      console.log("🔍 Retrieved patient data:", {
        promptId: patientData.id,
        patientId: patientData.patientId,
        batchId: patientData.batchId,
        promptLength: patientData.prompt?.length || 0,
        hasRawData: !!patientData.rawData,
      });

      const {
        name: patientName,
        prompt: triagePrompt,
        condition,
        age,
      } = patientData;

      // Get voice agent template for proper formatting
      const voiceAgentTemplate = await storage.getVoiceAgentTemplate();

      // Create enhanced system prompt by replacing template variables with actual patient data
      let enhancedSystemPrompt = voiceAgentTemplate;

      enhancedSystemPrompt = enhancedSystemPrompt
        .replace(/PATIENT_NAME/g, patientName || patientId)
        .replace(/PATIENT_AGE/g, age?.toString() || "unknown age")
        .replace(/PATIENT_CONDITION/g, condition || "general health assessment")
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
        patientId as string,
        5,
      );
      enhancedSystemPrompt = enhancedSystemPrompt.replace(
        /CONVERSATION_HISTORY/g,
        callHistoryContext.contextText,
      );

      console.log("🎯 Enhanced system prompt prepared:", {
        templateLength: voiceAgentTemplate.length,
        finalLength: enhancedSystemPrompt.length,
        hasCallHistory: callHistoryContext.hasHistory,
        recentCallsCount: callHistoryContext.recentCalls,
        contextLength: callHistoryContext.contextText.length,
      });

      const formattedPhoneNumber = formatPhoneNumberE164(phoneNumber);
      console.log(
        `📞 Phone number formatting: ${phoneNumber} → ${formattedPhoneNumber}`,
      );

      // Prepare call request with enhanced system prompt
      const callRequest = {
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        customer: {
          number: formattedPhoneNumber,
        },
        assistantId: process.env.VAPI_ASSISTANT_ID,
        assistantOverrides: {
          // Primary method: Complete system prompt override with patient data injected
          model: {
            provider: "openai",
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: enhancedSystemPrompt,
              },
            ],
          },
          // Backup method: Variable values for template replacement
          variableValues: {
            patientName: patientName || patientId,
            patientAge: age || 0,
            patientCondition: condition || "general health assessment",
            patientPrompt:
              triagePrompt || "No specific care assessment available",
            conversationHistory: callHistoryContext.contextText,
          },
        },
        metadata: {
          patientId: patientData.patientId,
          patientName: patientName,
          callType: callType,
          hasContext: true,
          batchId: patientData.batchId,
        },
      };

      console.log("🚀 Final call request prepared:", {
        phoneNumber: formattedPhoneNumber,
        assistantId: callRequest.assistantId,
        hasSystemPrompt:
          !!callRequest.assistantOverrides.model.messages[0].content,
        systemPromptLength:
          callRequest.assistantOverrides.model.messages[0].content.length,
        hasVariableValues: !!callRequest.assistantOverrides.variableValues,
        metadata: callRequest.metadata,
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

      console.log(`🔑 Using VAPI ${keyType} key for unified call`);

      // Make call to VAPI
      const vapiResponse = await fetch("https://api.vapi.ai/call", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(callRequest),
      });

      if (!vapiResponse.ok) {
        const errorData = await vapiResponse.json();
        console.error(`❌ VAPI unified call error:`, {
          status: vapiResponse.status,
          statusText: vapiResponse.statusText,
          error: errorData,
          keyType,
        });

        return res.status(vapiResponse.status).json({
          success: false,
          message: errorData.message || "Failed to initiate unified call",
          vapiError: errorData,
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
        callType: callType,
      });
    } catch (error) {
      console.error("❌ Error initiating unified call:", error);
      return res.status(500).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to initiate unified call",
      });
    }
  });

  // Get patients for companion calls
  app.get("/api/patients", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
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
            personalInfo: "", // TODO: Add personal info storage
          });
        }
      });

      const patients = Array.from(uniquePatients.values());

      return res.status(200).json({
        success: true,
        patients,
      });
    } catch (error) {
      console.error("❌ Error fetching patients:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch patients",
      });
    }
  });

  app.get("/api/vapi/triage-context", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const { patientId, batchId } = req.query;

      if (!patientId) {
        return res.status(400).json({
          success: false,
          message: "Patient ID is required",
        });
      }

      // Fetch the patient data (same logic as triage-call endpoint)
      let patientData;
      if (batchId) {
        patientData = await storage.getPatientPromptByIds(
          batchId as string,
          String(patientId),
        );
      }

      if (!patientData) {
        patientData = await storage.getLatestPatientPrompt(String(patientId));
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

      // Get voice agent template and create enhanced system prompt (same as triage-call)
      const voiceAgentTemplate = await storage.getVoiceAgentTemplate();
      let enhancedSystemPrompt = voiceAgentTemplate;

      enhancedSystemPrompt = enhancedSystemPrompt
        .replace(/PATIENT_NAME/g, patientName || String(patientId))
        .replace(/PATIENT_AGE/g, age?.toString() || "unknown age")
        .replace(/PATIENT_CONDITION/g, condition || "general health assessment")
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
        String(patientId),
        5,
      );
      enhancedSystemPrompt = enhancedSystemPrompt.replace(
        /CONVERSATION_HISTORY/g,
        callHistoryContext.contextText,
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
          systemPromptLength: enhancedSystemPrompt.length,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching triage context:", error);
      return res.status(500).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch triage context",
      });
    }
  });
}
