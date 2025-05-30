#!/usr/bin/env node

async function testWebhook() {
  try {
    console.log("🧪 Testing webhook endpoint...");
    
    const response = await fetch("http://localhost:5000/api/vapi/webhook/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({})
    });

    if (response.ok) {
      const result = await response.json();
      console.log("✅ Webhook test successful:", result);
      
      // Now check if the call was stored
      console.log("\n🔍 Checking call history...");
      const callHistoryResponse = await fetch("http://localhost:5000/api/call-history");
      
      if (callHistoryResponse.ok) {
        const callHistoryData = await callHistoryResponse.json();
        console.log("📞 Call history response:", callHistoryData);
      } else {
        console.error("❌ Failed to fetch call history:", callHistoryResponse.status);
      }
    } else {
      const errorData = await response.text();
      console.error("❌ Webhook test failed:", response.status, errorData);
    }
  } catch (error) {
    console.error("❌ Error testing webhook:", error.message);
  }
}

testWebhook(); 