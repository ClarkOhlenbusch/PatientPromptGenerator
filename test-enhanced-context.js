/**
 * Test script for enhanced call history context in VAPI system prompts
 * This tests the new getCallHistoryContext functionality
 */

const baseUrl = process.env.BASE_URL || "http://localhost:5000";

async function testCallHistoryContext() {
  console.log("🧪 Testing Enhanced Call History Context");
  console.log("=====================================");

  // Test patient ID - replace with an actual patient ID from your database
  const testPatientId = "PATIENT_001"; // Update this with a real patient ID

  try {
    // Test 1: Get call history context directly
    console.log("\n📋 Test 1: Direct call history context retrieval");
    const contextResponse = await fetch(`${baseUrl}/api/vapi/triage-context?patientId=${testPatientId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (contextResponse.ok) {
      const contextData = await contextResponse.json();
      console.log("✅ Context retrieved successfully:");
      console.log("- Has call history:", contextData.hasCallHistory);
      console.log("- Recent calls count:", contextData.recentCallsCount);
      console.log("- Context length:", contextData.contextLength);
      console.log("- Enhanced system prompt length:", contextData.systemPromptLength);
      
      if (contextData.hasCallHistory) {
        console.log("\n📞 Call History Summary:");
        console.log("- All summaries:", contextData.allSummaries?.length || 0);
        console.log("- All key points:", contextData.allKeyPoints?.length || 0);
        console.log("- All health concerns:", contextData.allHealthConcerns?.length || 0);
        console.log("- All follow-up items:", contextData.allFollowUpItems?.length || 0);
      }
    } else {
      console.log("❌ Failed to retrieve context:", contextResponse.status, contextResponse.statusText);
    }

    // Test 2: Test enhanced triage call (without actually making the call)
    console.log("\n📞 Test 2: Enhanced triage call preparation");
    const triageResponse = await fetch(`${baseUrl}/api/vapi/triage-context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        patientId: testPatientId,
        phoneNumber: "+1234567890", // Test phone number
        dryRun: true // If your endpoint supports dry run mode
      })
    });

    if (triageResponse.ok) {
      const triageData = await triageResponse.json();
      console.log("✅ Enhanced triage call prepared successfully:");
      console.log("- Patient name:", triageData.patientName);
      console.log("- Has context:", triageData.hasContext);
      console.log("- System prompt length:", triageData.systemPromptLength);
      console.log("- Call history included:", triageData.hasCallHistory);
    } else {
      console.log("❌ Failed to prepare triage call:", triageResponse.status, triageResponse.statusText);
    }

  } catch (error) {
    console.error("❌ Test failed with error:", error.message);
  }
}

async function testCallHistoryStorage() {
  console.log("\n🗄️ Testing Call History Storage");
  console.log("===============================");

  const testPatientId = "PATIENT_001";
  
  try {
    // Test creating sample call history data
    const sampleCallData = {
      callId: `test-call-${Date.now()}`,
      patientId: testPatientId,
      patientName: "Test Patient",
      phoneNumber: "+1234567890",
      duration: 300, // 5 minutes
      status: "completed",
      transcript: "Patient reported feeling better since last call. Mentioned taking medication regularly. Asked about upcoming appointment.",
      summary: "Patient is doing well, medication compliance good, needs appointment scheduling.",
      keyPoints: ["Feeling better", "Taking medication regularly", "Needs appointment"],
      healthConcerns: ["None reported"],
      followUpItems: ["Schedule next appointment", "Monitor medication effects"]
    };

    console.log("📝 Creating sample call history entry...");
    const createResponse = await fetch(`${baseUrl}/api/calls`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(sampleCallData)
    });

    if (createResponse.ok) {
      const createdCall = await createResponse.json();
      console.log("✅ Sample call history created:", createdCall.callId);
      
      // Now test the enhanced context with this new data
      await testCallHistoryContext();
    } else {
      console.log("❌ Failed to create sample call history:", createResponse.status);
    }

  } catch (error) {
    console.error("❌ Call history storage test failed:", error.message);
  }
}

// Run the tests
async function runTests() {
  console.log("🚀 Starting Enhanced Call History Context Tests");
  console.log("==============================================");
  
  await testCallHistoryContext();
  await testCallHistoryStorage();
  
  console.log("\n✅ Tests completed!");
}

// Execute if run directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testCallHistoryContext, testCallHistoryStorage }; 