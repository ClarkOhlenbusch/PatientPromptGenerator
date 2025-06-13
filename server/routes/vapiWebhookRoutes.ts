import { Express, Request, Response } from "express";
import { storage } from "../storage";
import {
  generateConversationSummary,
  storeCallHistoryWithDetails,
} from "./vapiHelpers";

export function registerVapiWebhookRoutes(app: Express): void {
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
          "speech-ended",
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
          metadata: call?.metadata,
        });

        if (call?.id) {
          const callId = call.id;
          const patientId = call.metadata?.patientId || "unknown";
          const patientName = call.metadata?.patientName || "Unknown Patient";
          const phoneNumber = call.customer?.number || "";
          const callEndedReason =
            message?.endedReason || call?.status || "unknown";

          // Attempt to calculate duration from webhook payload directly
          const callStartedAtEpoch = call.startedAt
            ? new Date(call.startedAt).getTime()
            : 0;
          const callEndedAtEpoch = call.endedAt
            ? new Date(call.endedAt).getTime()
            : 0;
          let calculatedDurationSeconds = 0;
          let usedDirectTimestamps = false;

          if (
            callEndedAtEpoch > 0 &&
            callStartedAtEpoch > 0 &&
            callEndedAtEpoch > callStartedAtEpoch
          ) {
            calculatedDurationSeconds = Math.floor(
              (callEndedAtEpoch - callStartedAtEpoch) / 1000,
            );
            usedDirectTimestamps = true;
            console.log(
              `⏱️ Duration from webhook: ${calculatedDurationSeconds}s (startedAt: ${call.startedAt}, endedAt: ${call.endedAt})`,
            );
          } else {
            console.warn(
              `⚠️ Call ${callId}: Webhook timestamps unusable (status: ${call?.status}). Deferred fetch initiated.`,
            );
          }

          // If direct timestamps were NOT usable, schedule a delayed fetch and return early.
          if (!usedDirectTimestamps) {
            // Non-blocking: Acknowledge webhook quickly, process storage in background.
            res
              .status(200)
              .json({
                success: true,
                message:
                  "Webhook acknowledged, processing call details via deferred fetch.",
              });

            // Start delayed processing.
            setTimeout(async () => {
              try {
                console.log(
                  `⏳ Call ${callId}: Starting delayed fetch for complete call details (10s delay).`,
                );
                const vapiToken = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY;
                
                if (!vapiToken) {
                  console.error(`❌ Call ${callId} (deferred fetch): No VAPI token available in environment variables`);
                  await storeCallHistoryWithDetails(
                    callId,
                    patientId,
                    patientName,
                    phoneNumber,
                    0,
                    callEndedReason,
                    transcript,
                    summary,
                    call.endedAt || new Date().toISOString(),
                    call.metadata,
                    "missing_vapi_token",
                  );
                  return;
                }
                const vapiCallDetailsResponse = await fetch(
                  `https://api.vapi.ai/call/${callId}`,
                  {
                    method: "GET",
                    headers: {
                      Authorization: `Bearer ${vapiToken}`,
                      "Content-Type": "application/json",
                    },
                  },
                );

                if (!vapiCallDetailsResponse.ok) {
                  const errorText = await vapiCallDetailsResponse.text();
                  console.error(
                    `❌ Call ${callId} (deferred fetch): Error fetching call details from Vapi API: ${vapiCallDetailsResponse.status} - ${errorText}`,
                  );
                  await storeCallHistoryWithDetails(
                    callId,
                    patientId,
                    patientName,
                    phoneNumber,
                    0,
                    callEndedReason,
                    transcript,
                    summary,
                    call.endedAt || new Date().toISOString(),
                    call.metadata,
                    "deferred_fetch_api_error",
                  );
                  return;
                }

                const callDetails = await vapiCallDetailsResponse.json();
                console.log(
                  `📊 Call ${callId} (deferred fetch): Fetched call details from Vapi API:`,
                  {
                    id: callDetails.id,
                    createdAt: callDetails.createdAt,
                    updatedAt: callDetails.updatedAt,
                    status: callDetails.status,
                    endedReason: callDetails.endedReason,
                    startedAt: callDetails.startedAt,
                    endedAt: callDetails.endedAt,
                  },
                );

                let finalDurationSeconds = 0;
                const fetchedStartedAt = callDetails.startedAt
                  ? new Date(callDetails.startedAt).getTime()
                  : 0;
                const fetchedEndedAt = callDetails.endedAt
                  ? new Date(callDetails.endedAt).getTime()
                  : 0;

                if (
                  fetchedEndedAt > 0 &&
                  fetchedStartedAt > 0 &&
                  fetchedEndedAt > fetchedStartedAt
                ) {
                  finalDurationSeconds = Math.floor(
                    (fetchedEndedAt - fetchedStartedAt) / 1000,
                  );
                  console.log(
                    `⏱️ Call ${callId} (deferred fetch): Duration from Vapi API (startedAt/endedAt): ${finalDurationSeconds}s`,
                  );
                } else if (callDetails.createdAt && callDetails.updatedAt) {
                  const createdAtEpoch = new Date(
                    callDetails.createdAt,
                  ).getTime();
                  const updatedAtEpoch = new Date(
                    callDetails.updatedAt,
                  ).getTime();
                  if (updatedAtEpoch > createdAtEpoch) {
                    finalDurationSeconds = Math.floor(
                      (updatedAtEpoch - createdAtEpoch) / 1000,
                    );
                    console.log(
                      `⏱️ Call ${callId} (deferred fetch): Duration from Vapi API (createdAt/updatedAt): ${finalDurationSeconds}s`,
                    );
                  } else {
                    console.warn(
                      `⚠️ Call ${callId} (deferred fetch): Vapi API updatedAt (${callDetails.updatedAt}) not after createdAt (${callDetails.createdAt}). Using 0 duration.`,
                    );
                  }
                } else {
                  console.warn(
                    `⚠️ Call ${callId} (deferred fetch): Vapi API also missing sufficient timestamps. Using 0 duration.`,
                  );
                }

                await storeCallHistoryWithDetails(
                  callId,
                  patientId,
                  patientName,
                  phoneNumber,
                  finalDurationSeconds,
                  callDetails.endedReason || callEndedReason,
                  transcript,
                  summary,
                  callDetails.endedAt ||
                    callDetails.updatedAt ||
                    new Date().toISOString(),
                  callDetails.metadata,
                  "deferred_fetch_success",
                );
              } catch (fetchError) {
                console.error(
                  `❌ Call ${callId} (deferred fetch): Exception during delayed fetch/store:`,
                  fetchError,
                );
                await storeCallHistoryWithDetails(
                  callId,
                  patientId,
                  patientName,
                  phoneNumber,
                  0,
                  callEndedReason,
                  transcript,
                  summary,
                  call.endedAt || new Date().toISOString(),
                  call.metadata,
                  "deferred_fetch_exception",
                );
              }
            }, 10000); // 10-second delay.

            return; // CRITICAL: Ensures no further code in this handler runs for this request.
          } else {
            // This block is for when webhook timestamps ARE usable.
            console.log(
              `✅ Call ${callId}: Using direct webhook timestamps for duration calculation.`,
            );
            await storeCallHistoryWithDetails(
              callId,
              patientId,
              patientName,
              phoneNumber,
              calculatedDurationSeconds,
              callEndedReason,
              transcript,
              summary,
              call.endedAt!,
              call.metadata,
              "direct_webhook_timestamps",
            );
            return res.status(200).json({ success: true });
          }
        } else {
          console.warn("⚠️ Webhook end-of-call-report missing call.id");
          return res
            .status(400)
            .json({ success: false, message: "Missing call ID in webhook" });
        }
      } else if (webhookData.message?.type) {
        // For other message types, just acknowledge
        // console.log(`✅ Other webhook type ${webhookData.message.type} acknowledged.`);
        return res
          .status(200)
          .json({ success: true, message: "Webhook acknowledged" });
      } else {
        console.warn("⚠️ Unknown or malformed webhook structure received.");
        return res
          .status(400)
          .json({ success: false, message: "Malformed webhook" });
      }

      // Fallthrough for any case not handled above (e.g. no message type)
      // This line should ideally not be reached if all webhook types are handled or acknowledged.
      // console.log("✅ Webhook processed (default acknowledgement)");
      // return res.status(200).json({ success: true }); // This was causing issues, removed in favor of specific returns.
    } catch (error) {
      console.error("❌ Error processing Vapi webhook:", error);
      return res.status(500).json({
        success: false,
        message: "Error processing webhook",
      });
    }
  });

  // Test endpoint to verify webhook is accessible (for debugging)
  app.get("/api/vapi/webhook", async (req: Request, res: Response) => {
    console.log("🧪 Webhook test endpoint accessed");
    return res.status(200).json({
      success: true,
      message: "Webhook endpoint is accessible",
      timestamp: new Date().toISOString(),
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
              number: "+1234567890",
            },
            metadata: {
              patientId: "Diane, Affre (11/16/1943 )",
              patientName: "Diane, Affre",
              batchId: "test-batch",
            },
          },
          transcript:
            "Hello Diane, this is your healthcare assistant calling to check in on how you're feeling today. How have you been since our last conversation? I see from your recent health data that everything looks good - your heart rate is stable at 86 bpm. That's excellent! Are you keeping up with your regular physical activity? Great to hear. Remember to maintain that balanced diet we discussed, especially those heart-healthy foods rich in omega-3 fatty acids. Is there anything specific about your health that you'd like to discuss today?",
          summary:
            "Routine check-in call with Diane Affre. Patient reports feeling well and maintaining good health habits. Heart rate stable, continuing recommended diet and exercise routine.",
          endedReason: "customer-hangup",
        },
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
          metadata: call?.metadata,
        });

        if (call?.id) {
          console.log("🧪 Step 1: Generating AI summary...");
          // Generate AI-powered conversation summary from transcript
          const aiSummary = await generateConversationSummary(
            transcript || "",
            summary,
          );
          console.log("🧪 Step 1 Complete: AI summary generated:", aiSummary);

          // Extract patient info from call metadata
          const patientId = call.metadata?.patientId || "test-patient";
          const patientName = call.metadata?.patientName || "Test Patient";
          const phoneNumber = call.customer?.number || "+1234567890";

          // Calculate call duration
          const duration =
            call.endedAt && call.startedAt
              ? Math.floor(
                  (new Date(call.endedAt).getTime() -
                    new Date(call.startedAt).getTime()) /
                    1000,
                )
              : 120;

          console.log("🧪 Step 2: Preparing call history data:", {
            callId: call.id,
            patientId,
            patientName,
            phoneNumber,
            duration,
            status: "completed",
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
            callDate: call.endedAt ? new Date(call.endedAt) : new Date(),
          });

          console.log(
            `🧪 ✅ Step 3 Complete: Stored test call history for patient ${patientName} (${call.id})`,
          );
        } else {
          console.log("🧪 ❌ No call ID found in webhook data");
        }
      }

      console.log("🧪 ✅ WEBHOOK TEST COMPLETED SUCCESSFULLY");
      return res.status(200).json({
        success: true,
        message: "Test webhook processed successfully",
        callId: simulatedWebhook.message.call.id,
      });
    } catch (error) {
      console.error(
        "🧪 ❌ WEBHOOK TEST FAILED - Error processing test webhook:",
        error,
      );
      if (error instanceof Error) {
        console.error("🧪 Error stack:", error.stack);
        return res.status(500).json({
          success: false,
          message: "Error processing test webhook",
          error: error.message,
        });
      }
      return res.status(500).json({
        success: false,
        message: "Error processing test webhook",
        error: "Unknown error",
      });
    }
  });

}
