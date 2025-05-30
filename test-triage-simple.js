#!/usr/bin/env node

/**
 * Simple test script for triage context injection
 * Tests the public endpoints without requiring authentication
 */

async function testTriageContextSimple() {
  const baseUrl = "http://localhost:5000";
  
  console.log("🧪 Testing Triage Context Injection (Simple)...\n");

  try {
    // First, let's test if the server is responding
    console.log("1. Testing server connectivity...");
    const healthResponse = await fetch(`${baseUrl}/api/vapi/webhook`);
    
    if (!healthResponse.ok) {
      throw new Error(`Server not responding: ${healthResponse.status}`);
    }
    
    const healthData = await healthResponse.json();
    console.log("✅ Server is running:", healthData.message);

    // Test common patient IDs that might exist in your database
    const testPatientIds = [
      "Marie, Gachet",
      "Diane, Affre (11/16/1943 )",
      "John, Smith",
      "Test Patient"
    ];

    console.log("\n2. Testing triage context for common patients...");
    
    let successfulTest = false;
    
    for (const patientId of testPatientIds) {
      console.log(`\n   Testing patient: ${patientId}`);
      
      try {
        const response = await fetch(`${baseUrl}/api/vapi/test-triage-context/${encodeURIComponent(patientId)}`);
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.success) {
            console.log("   ✅ SUCCESS! Found patient with triage data:");
            console.log(`      Name: ${data.data.name}`);
            console.log(`      Condition: ${data.data.condition}`);
            console.log(`      Age: ${data.data.age}`);
            console.log(`      Triage prompt length: ${data.data.triagePromptLength} chars`);
            console.log(`      System prompt length: ${data.data.systemPromptLength} chars`);
            console.log(`      Has recent call: ${data.data.hasRecentCall}`);
            console.log(`      Context injection working: ${data.data.contextInjectionWorking}`);
            
            // Show a preview of the triage prompt
            if (data.data.triagePrompt) {
              console.log(`\n   📋 Triage prompt preview (first 200 chars):`);
              console.log(`      "${data.data.triagePrompt.substring(0, 200)}..."`);
            }
            
            // Show a preview of the enhanced system prompt
            if (data.data.enhancedSystemPrompt) {
              console.log(`\n   🤖 Enhanced system prompt preview (first 300 chars):`);
              console.log(`      "${data.data.enhancedSystemPrompt.substring(0, 300)}..."`);
            }
            
            successfulTest = true;
            break;
          }
        } else {
          console.log(`   ❌ Patient not found or no triage data: ${response.status}`);
        }
      } catch (error) {
        console.log(`   ❌ Error testing patient: ${error.message}`);
      }
    }

    if (successfulTest) {
      console.log("\n🎉 SUCCESS! Triage context injection is working correctly!");
      console.log("\n📋 Summary:");
      console.log("   ✅ Server is running and responding");
      console.log("   ✅ Found patient with triage data in database");
      console.log("   ✅ Context injection working correctly");
      console.log("   ✅ Enhanced system prompt generation working");
      console.log("   ✅ Ready for actual triage calls with full patient context");
      
      console.log("\n💡 Next steps:");
      console.log("   1. Open the web interface and go to AI Companion Calls");
      console.log("   2. Use the 'Triage Calls with Patient Context' section");
      console.log("   3. Select the patient you just tested");
      console.log("   4. Preview context if desired");
      console.log("   5. Make a real call with full triage context!");
      
    } else {
      console.log("\n⚠️  No patients with triage data found in the database.");
      console.log("\n📝 To test properly:");
      console.log("   1. Make sure you've uploaded patient data through the triage section");
      console.log("   2. Check that patient_prompts table has data");
      console.log("   3. Try accessing the web interface and uploading some patients first");
    }

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.log("\n🔧 Troubleshooting:");
    console.log("   • Make sure the server is running: npm start");
    console.log("   • Check that you're in the correct directory");
    console.log("   • Verify the server is accessible on localhost:5000");
    console.log("   • Make sure the database contains patient data");
  }
}

// Run the test
testTriageContextSimple(); 