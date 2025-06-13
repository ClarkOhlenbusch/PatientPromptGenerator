import OpenAI from "openai";
import { storage } from "../storage";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateConversationSummary(
  transcript: string,
  vapiSummary?: string,
) {
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

${vapiSummary ? `Vapi Summary: ${vapiSummary}` : ""}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a healthcare assistant analyzing patient call transcripts. Extract key information that would be valuable for healthcare providers and future follow-up calls.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    return {
      summary: result.summary || "Call completed successfully",
      keyPoints: result.keyPoints || [],
      healthConcerns: result.healthConcerns || [],
      followUpItems: result.followUpItems || [],
    };
  } catch (error) {
    console.error("Error generating conversation summary:", error);
    return {
      summary: vapiSummary || "Call completed - summary generation failed",
      keyPoints: [],
      healthConcerns: [],
      followUpItems: [],
    };
  }
}

export function formatPhoneNumberE164(phoneNumber: string): string {
  let cleaned = phoneNumber.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  if (cleaned.length === 10) {
    cleaned = "+1" + cleaned;
  } else if (cleaned.length === 11 && cleaned.startsWith("1")) {
    cleaned = "+" + cleaned;
  } else {
    throw new Error(
      "Phone number must be in international format starting with + (e.g., +40753837147 for Romania, +1234567890 for US)"
    );
  }
  return cleaned;
}

export async function storeCallHistoryWithDetails(
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
  source?: string,
) {
  try {
    console.log(
      `💾 Storing call history for ${callId} from source: ${source || "unknown"}. Duration: ${durationSeconds}s`,
    );
    const aiSummary = await generateConversationSummary(
      transcript || "",
      vapiSummary || undefined,
    );

    let finalCallStatus = "completed";
    if (callStatusReason) {
      switch (callStatusReason.toLowerCase()) {
        case "customer-hangup":
        case "assistant-hangup":
        case "customer-ended-call":
        case "ended":
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
        case "failed":
          finalCallStatus = "failed";
          break;
        default:
          finalCallStatus = callStatusReason.substring(0, 50);
      }
    }

    const patientInfoFromMeta = callMetadata?.patientId
      ? {
          patientId: callMetadata.patientId,
          patientName: callMetadata.patientName || patientName,
        }
      : { patientId, patientName };

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
      callDate: new Date(callEndTimeISO),
    });

    console.log(
      `✅ Stored call history for patient ${patientInfoFromMeta.patientName} (${callId}), Duration: ${durationSeconds}s, Status: ${finalCallStatus}`,
    );
  } catch (storageError) {
    console.error(`❌ Call ${callId}: Error storing call history:`, storageError);
  }
}
