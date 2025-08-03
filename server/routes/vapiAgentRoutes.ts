import { Express, Request, Response } from "express";
import { storage } from "../storage";

export function registerVapiAgentRoutes(app: Express): void {

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
          message: "Vapi API key not configured",
        });
      }

      const agentId = process.env.VAPI_ASSISTANT_ID;

      // Fetch agent configuration from Vapi
      const vapiResponse = await fetch(
        `https://api.vapi.ai/assistant/${agentId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${vapiPrivateKey}`,
          },
        },
      );

      if (!vapiResponse.ok) {
        const errorData = await vapiResponse.json();
        return res.status(vapiResponse.status).json({
          success: false,
          message: "Failed to fetch agent configuration",
          details: errorData,
        });
      }

      const agentData = await vapiResponse.json();

      return res.status(200).json({
        success: true,
        data: agentData,
      });
    } catch (error) {
      console.error("Error fetching Vapi agent config:", error);
      return res.status(500).json({
        success: false,
        message: `Error fetching agent config: ${error instanceof Error ? error.message : String(error)}`,
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

      const { firstMessage, systemPrompt, voiceProvider, voiceId, model } =
        req.body;

      console.log("PATCH /api/vapi/agent - Received payload:", {
        firstMessage,
        systemPrompt: systemPrompt ? `${systemPrompt.substring(0, 100)}...` : systemPrompt,
        voiceProvider,
        voiceId,
        model
      });

      const vapiPrivateKey = process.env.VAPI_PRIVATE_KEY;
      if (!vapiPrivateKey) {
        return res.status(500).json({
          success: false,
          message: "Vapi API key not configured",
        });
      }

      const agentId = process.env.VAPI_ASSISTANT_ID;

      // First, get the current agent configuration to preserve existing settings
      const currentAgentResponse = await fetch(
        `https://api.vapi.ai/assistant/${agentId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${vapiPrivateKey}`,
          },
        },
      );

      if (!currentAgentResponse.ok) {
        return res.status(500).json({
          success: false,
          message: "Failed to fetch current agent configuration",
        });
      }

      const currentAgent = await currentAgentResponse.json();

      // Prepare the update payload for Vapi, preserving existing configuration
      const updatePayload: any = {};

      // Only include fields that are being updated
      if (firstMessage !== undefined) {
        updatePayload.firstMessage = firstMessage;
      }

      if (voiceProvider !== undefined || voiceId !== undefined) {
        updatePayload.voice = {
          provider: voiceProvider !== undefined ? voiceProvider : (currentAgent.voice?.provider || "vapi"),
          voiceId: voiceId !== undefined ? voiceId : (currentAgent.voice?.voiceId || "Kylie"),
        };
      }

      if (systemPrompt !== undefined || model !== undefined) {
        // Use the user's system prompt directly when provided, otherwise keep existing
        const finalSystemPrompt = systemPrompt !== undefined ? systemPrompt : currentAgent.model?.messages?.[0]?.content || `You are an empathetic AI voice companion conducting a 15-minute check-in call with a patient.

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
              content: finalSystemPrompt,
            },
          ],
          // Preserve other model settings if they exist
          ...(currentAgent.model?.temperature !== undefined && {
            temperature: currentAgent.model.temperature,
          }),
          ...(currentAgent.model?.maxTokens !== undefined && {
            maxTokens: currentAgent.model.maxTokens,
          }),
        };
      }

      // Configure webhook URL for call completion events
      if (!updatePayload.server) {
        updatePayload.server = {
          url: `${process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "http://localhost:5000"}/api/vapi/webhook`,
          secret: process.env.VAPI_WEBHOOK_SECRET || "webhook-secret-key",
        };
      }

      // Ensure analysis plan is configured to generate summaries and structured data
      if (!updatePayload.analysisPlan) {
        updatePayload.analysisPlan = {
          summaryPlan: {
            messages: [
              {
                role: "system",
                content:
                  "Summarize this conversation for the patient's caretaker. Focus on the patient's overall mood, any changes in health status, new or ongoing symptoms, and anything else they shared that may be relevant to their care (such as emotional well-being, social interactions, or lifestyle factors). Include any signs of confusion, distress, or unusual behavior. Be concise, objective, and use clear language suitable for a nurse or clinician reviewing patient records. If the patient mentioned any specific requests, concerns, or follow-up needs, highlight them at the end.",
              },
              {
                role: "user",
                content:
                  "Here is the transcript:\n\n{{transcript}}\n\n. Here is the ended reason of the call:\n\n{{endedReason}}\n\n",
              },
            ],
          },
          structuredDataPlan: {
            messages: [
              {
                role: "system",
                content:
                  "You are an expert data extractor. You will be given a transcript of a call. Extract structured data per the JSON Schema. DO NOT return anything except the structured data.\n\nJson Schema:\n{{schema}}\n\nOnly respond with the JSON.",
              },
              {
                role: "user",
                content:
                  "Here is the transcript:\n\n{{transcript}}\n\n. Here is the ended reason of the call:\n\n{{endedReason}}\n\n",
              },
            ],
          },
        };
      }

      // Note: Variables are passed via assistantOverrides.variableValues during calls,
      // not stored in the assistant configuration itself

      console.log(
        "Vapi update payload:",
        JSON.stringify(updatePayload, null, 2),
      );

      // Update agent configuration via Vapi API
      const vapiResponse = await fetch(
        `https://api.vapi.ai/assistant/${agentId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${vapiPrivateKey}`,
          },
          body: JSON.stringify(updatePayload),
        },
      );

      if (!vapiResponse.ok) {
        const errorText = await vapiResponse.text();
        console.error("Vapi API error:", {
          status: vapiResponse.status,
          statusText: vapiResponse.statusText,
          body: errorText,
          headers: Object.fromEntries(vapiResponse.headers.entries()),
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
          vapiError: errorText,
        });
      }

      const updatedAgent = await vapiResponse.json();

      return res.status(200).json({
        success: true,
        message: "Agent configuration updated successfully",
        data: updatedAgent,
      });
    } catch (error) {
      console.error("Error updating Vapi agent:", error);
      return res.status(500).json({
        success: false,
        message: `Error updating agent: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });

  // Get triage context preview for a patient
  app.post("/api/vapi/fix-assistant", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const vapiPrivateKey = process.env.VAPI_PRIVATE_KEY;
      if (!vapiPrivateKey) {
        return res.status(500).json({
          success: false,
          message: "Vapi API key not configured",
        });
      }

      const agentId = process.env.VAPI_ASSISTANT_ID;

      console.log("🔧 Fixing VAPI assistant configuration...");

      // Force update the assistant with proper webhook, analysis plan, and correct variable format
      const updatePayload = {
        server: {
          url: `${process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "http://localhost:5000"}/api/vapi/webhook`,
          secret: process.env.VAPI_WEBHOOK_SECRET || "webhook-secret-key",
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

IMPORTANT: You have access to their latest health data and personalized care recommendations above. Use this information throughout the conversation to provide relevant, personalized care.`,
            },
          ],
        },
        analysisPlan: {
          summaryPlan: {
            messages: [
              {
                role: "system",
                content:
                  "Summarize this conversation for the patient's caretaker. Focus on the patient's overall mood, any changes in health status, new or ongoing symptoms, and anything else they shared that may be relevant to their care (such as emotional well-being, social interactions, or lifestyle factors). Include any signs of confusion, distress, or unusual behavior. Be concise, objective, and use clear language suitable for a nurse or clinician reviewing patient records. If the patient mentioned any specific requests, concerns, or follow-up needs, highlight them at the end.",
              },
              {
                role: "user",
                content:
                  "Here is the transcript:\n\n{{transcript}}\n\n. Here is the ended reason of the call:\n\n{{endedReason}}\n\n",
              },
            ],
          },
          structuredDataPlan: {
            messages: [
              {
                role: "system",
                content:
                  "You are an expert data extractor. You will be given a transcript of a call. Extract structured data per the JSON Schema. DO NOT return anything except the structured data.\n\nJson Schema:\n{{schema}}\n\nOnly respond with the JSON.",
              },
              {
                role: "user",
                content:
                  "Here is the transcript:\n\n{{transcript}}\n\n. Here is the ended reason of the call:\n\n{{endedReason}}\n\n",
              },
            ],
          },
        },
      };

      console.log(
        "🔧 VAPI assistant update payload:",
        JSON.stringify(updatePayload, null, 2),
      );

      // Update assistant configuration via Vapi API
      const vapiResponse = await fetch(
        `https://api.vapi.ai/assistant/${agentId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${vapiPrivateKey}`,
          },
          body: JSON.stringify(updatePayload),
        },
      );

      if (!vapiResponse.ok) {
        const errorText = await vapiResponse.text();
        console.error("🔧 ❌ Failed to update VAPI assistant:", errorText);
        return res.status(500).json({
          success: false,
          message: `Failed to update VAPI assistant: ${errorText}`,
        });
      }

      const updatedAgent = await vapiResponse.json();
      console.log("🔧 ✅ VAPI assistant configuration updated successfully");

      return res.status(200).json({
        success: true,
        message: "VAPI assistant configuration updated successfully",
        agent: updatedAgent,
      });
    } catch (error) {
      console.error("🔧 ❌ Error fixing VAPI assistant:", error);
      return res.status(500).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to fix VAPI assistant configuration",
      });
    }
  });
}
