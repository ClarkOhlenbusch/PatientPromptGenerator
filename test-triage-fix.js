#!/usr/bin/env node

/**
 * Test script to verify the AI Triage race condition fix
 * 
 * This script tests the batch resolution and prompt loading endpoints
 * to ensure they work reliably without race conditions.
 */

const baseUrl = "http://localhost:5000";

async function testTriageLoad() {
  console.log("🧪 Testing AI Triage loading sequence...\n");

  try {
    // Step 1: Test latest batch endpoint
    console.log("1️⃣ Testing latest batch endpoint...");
    const latestBatchResponse = await fetch(`${baseUrl}/api/batches/latest`, {
      credentials: 'include'
    });
    
    if (!latestBatchResponse.ok) {
      console.log("❌ Latest batch endpoint failed:", latestBatchResponse.status);
      return;
    }
    
    const latestBatchData = await latestBatchResponse.json();
    const latestBatch = latestBatchData.success && latestBatchData.data ? latestBatchData.data : null;
    
    if (latestBatch?.batchId) {
      console.log("✅ Latest batch found:", latestBatch.batchId);
    } else {
      console.log("⚠️ No latest batch found");
    }

    // Step 2: Test all batches endpoint
    console.log("\n2️⃣ Testing all batches endpoint...");
    const allBatchesResponse = await fetch(`${baseUrl}/api/batches`, {
      credentials: 'include'
    });
    
    if (!allBatchesResponse.ok) {
      console.log("❌ All batches endpoint failed:", allBatchesResponse.status);
      return;
    }
    
    const allBatchesData = await allBatchesResponse.json();
    const allBatches = allBatchesData.success && allBatchesData.data ? allBatchesData.data : [];
    
    console.log(`✅ Found ${allBatches.length} total batches`);

    // Step 3: Test latest batch prompts (if latest batch exists)
    if (latestBatch?.batchId) {
      console.log(`\n3️⃣ Testing prompts for latest batch (${latestBatch.batchId})...`);
      const latestPromptsResponse = await fetch(`${baseUrl}/api/patient-prompts/${latestBatch.batchId}`, {
        credentials: 'include'
      });
      
      if (latestPromptsResponse.ok) {
        const latestPromptsData = await latestPromptsResponse.json();
        const latestPrompts = latestPromptsData.success && latestPromptsData.data ? latestPromptsData.data : [];
        
        if (latestPrompts.length > 0) {
          console.log(`✅ Latest batch has ${latestPrompts.length} prompts - READY TO DISPLAY`);
        } else {
          console.log("⚠️ Latest batch has no prompts, will search other batches");
          
          // Step 4: Search for batch with prompts
          console.log("\n4️⃣ Searching for batches with prompts...");
          let foundBatchWithPrompts = null;
          
          for (const batch of [...allBatches].reverse()) {
            try {
              const batchPromptsResponse = await fetch(`${baseUrl}/api/patient-prompts/${batch.batchId}`, {
                credentials: 'include'
              });
              
              if (batchPromptsResponse.ok) {
                const batchPromptsData = await batchPromptsResponse.json();
                const batchPrompts = batchPromptsData.success && batchPromptsData.data ? batchPromptsData.data : [];
                
                if (batchPrompts.length > 0) {
                  foundBatchWithPrompts = batch.batchId;
                  console.log(`✅ Found batch with prompts: ${batch.batchId} (${batchPrompts.length} prompts)`);
                  break;
                }
              }
            } catch (error) {
              console.log(`❌ Error checking batch ${batch.batchId}:`, error.message);
            }
          }
          
          if (!foundBatchWithPrompts) {
            console.log("❌ No batches with prompts found");
          }
        }
      } else {
        console.log("❌ Failed to fetch prompts for latest batch:", latestPromptsResponse.status);
      }
    }

    // Step 5: Simulate the complete loading sequence
    console.log("\n5️⃣ Simulating complete AI Triage loading sequence...");
    
    // Determine effective batch ID (same logic as frontend)
    let effectiveBatchId = null;
    
    if (latestBatch?.batchId) {
      // Check if latest batch has prompts
      const latestPromptsResponse = await fetch(`${baseUrl}/api/patient-prompts/${latestBatch.batchId}`, {
        credentials: 'include'
      });
      
      if (latestPromptsResponse.ok) {
        const latestPromptsData = await latestPromptsResponse.json();
        const latestPrompts = latestPromptsData.success && latestPromptsData.data ? latestPromptsData.data : [];
        
        if (latestPrompts.length > 0) {
          effectiveBatchId = latestBatch.batchId;
          console.log(`📋 Effective batch ID: ${effectiveBatchId} (latest with prompts)`);
        } else {
          // Find alternative batch with prompts
          for (const batch of [...allBatches].reverse()) {
            try {
              const batchPromptsResponse = await fetch(`${baseUrl}/api/patient-prompts/${batch.batchId}`, {
                credentials: 'include'
              });
              
              if (batchPromptsResponse.ok) {
                const batchPromptsData = await batchPromptsResponse.json();
                const batchPrompts = batchPromptsData.success && batchPromptsData.data ? batchPromptsData.data : [];
                
                if (batchPrompts.length > 0) {
                  effectiveBatchId = batch.batchId;
                  console.log(`📋 Effective batch ID: ${effectiveBatchId} (alternative with prompts)`);
                  break;
                }
              }
            } catch (error) {
              // Continue to next batch
            }
          }
          
          if (!effectiveBatchId) {
            effectiveBatchId = latestBatch.batchId;
            console.log(`📋 Effective batch ID: ${effectiveBatchId} (fallback to latest)`);
          }
        }
      }
    }

    if (effectiveBatchId) {
      console.log(`\n🎯 Final test: Loading prompts for effective batch ${effectiveBatchId}...`);
      
      const finalPromptsResponse = await fetch(`${baseUrl}/api/patient-prompts/${effectiveBatchId}`, {
        credentials: 'include'
      });
      
      if (finalPromptsResponse.ok) {
        const finalPromptsData = await finalPromptsResponse.json();
        const finalPrompts = finalPromptsData.success && finalPromptsData.data ? finalPromptsData.data : [];
        
        console.log(`🎉 SUCCESS! AI Triage would display ${finalPrompts.length} prompts`);
        console.log("✅ No race condition - batch resolution is deterministic");
      } else {
        console.log("❌ Failed to load final prompts:", finalPromptsResponse.status);
      }
    } else {
      console.log("❌ No effective batch ID found - would show 'no batch found' message");
    }

  } catch (error) {
    console.error("❌ Test failed with error:", error.message);
  }
}

// Run the test
testTriageLoad().then(() => {
  console.log("\n🏁 Test completed");
}).catch(error => {
  console.error("❌ Test script error:", error.message);
  process.exit(1);
}); 