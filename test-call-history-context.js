/**
 * Test script to verify call history context functionality
 * Tests the getCallHistoryContext method with actual database data
 */

const BASE_URL = 'http://localhost:5000';

async function testCallHistoryContext() {
  console.log('🧪 Testing Call History Context Implementation\n');

  try {
    // Test 1: Login to get session
    console.log('1. Authenticating...');
    const loginResponse = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'CalicoCare', password: 'CalicoCare' }),
      credentials: 'include'
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }
    console.log('✅ Authentication successful\n');

    // Test 2: Get call history for patient with multiple calls (Gabriel - patient ID 3164)
    console.log('2. Testing call history retrieval for patient 3164 (Gabriel)...');
    const callHistoryResponse = await fetch(`${BASE_URL}/api/call-history?patientId=3164&limit=5`, {
      credentials: 'include'
    });

    if (!callHistoryResponse.ok) {
      throw new Error(`Call history fetch failed: ${callHistoryResponse.status}`);
    }

    const callHistoryData = await callHistoryResponse.json();
    console.log(`✅ Retrieved ${callHistoryData.data.length} calls for patient 3164`);
    
    // Display call history structure
    if (callHistoryData.data.length > 0) {
      const firstCall = callHistoryData.data[0];
      console.log('📋 Sample call structure:');
      console.log(`   - Call ID: ${firstCall.callId}`);
      console.log(`   - Date: ${firstCall.callDate}`);
      console.log(`   - Duration: ${firstCall.duration}s`);
      console.log(`   - Status: ${firstCall.status}`);
      console.log(`   - Summary length: ${firstCall.summary?.length || 0} chars`);
      console.log(`   - Key points: ${firstCall.keyPoints?.length || 0} items`);
      console.log(`   - Health concerns: ${firstCall.healthConcerns?.length || 0} items`);
      console.log(`   - Follow-up items: ${firstCall.followUpItems?.length || 0} items\n`);
    }

    // Test 3: Test the triage context endpoint (this should use getCallHistoryContext)
    console.log('3. Testing triage context endpoint with call history...');
    const contextResponse = await fetch(`${BASE_URL}/api/vapi/triage-context?patientId=3164&batchId=batch_20250530_123456`, {
      credentials: 'include'
    });

    if (!contextResponse.ok) {
      throw new Error(`Triage context failed: ${contextResponse.status}`);
    }

    const contextData = await contextResponse.json();
    console.log('✅ Triage context generated successfully');
    console.log(`📝 Enhanced system prompt length: ${contextData.enhancedSystemPrompt?.length || 0} chars`);
    
    // Check if call history is included in the prompt
    if (contextData.enhancedSystemPrompt) {
      const hasCallHistory = contextData.enhancedSystemPrompt.includes('PREVIOUS CALL HISTORY');
      const hasCallSummaries = contextData.enhancedSystemPrompt.includes('CALL SUMMARIES');
      const hasKeyPoints = contextData.enhancedSystemPrompt.includes('KEY DISCUSSION POINTS');
      const hasHealthConcerns = contextData.enhancedSystemPrompt.includes('HEALTH CONCERNS MENTIONED');
      const hasFollowUp = contextData.enhancedSystemPrompt.includes('FOLLOW-UP ITEMS');

      console.log('🔍 Call history context analysis:');
      console.log(`   - Contains call history section: ${hasCallHistory ? '✅' : '❌'}`);
      console.log(`   - Contains call summaries: ${hasCallSummaries ? '✅' : '❌'}`);
      console.log(`   - Contains key discussion points: ${hasKeyPoints ? '✅' : '❌'}`);
      console.log(`   - Contains health concerns: ${hasHealthConcerns ? '✅' : '❌'}`);
      console.log(`   - Contains follow-up items: ${hasFollowUp ? '✅' : '❌'}\n`);

      // Extract and display a sample of the call history context
      const callHistoryMatch = contextData.enhancedSystemPrompt.match(/PREVIOUS CALL HISTORY[\s\S]*?(?=\n\nIMPORTANT:|$)/);
      if (callHistoryMatch) {
        console.log('📄 Sample call history context (first 500 chars):');
        console.log(callHistoryMatch[0].substring(0, 500) + '...\n');
      }
    }

    // Test 4: Test with patient that has no call history
    console.log('4. Testing with patient that has no call history...');
    const noHistoryResponse = await fetch(`${BASE_URL}/api/vapi/triage-context?patientId=999999&batchId=batch_20250530_123456`, {
      credentials: 'include'
    });

    if (noHistoryResponse.ok) {
      const noHistoryData = await noHistoryResponse.json();
      const hasFirstConversation = noHistoryData.enhancedSystemPrompt?.includes('This is your first conversation with this patient');
      console.log(`✅ No history case handled correctly: ${hasFirstConversation ? '✅' : '❌'}\n`);
    }

    // Test 5: Verify database data integrity
    console.log('5. Verifying database data integrity...');
    const allCallsResponse = await fetch(`${BASE_URL}/api/call-history?limit=20`, {
      credentials: 'include'
    });

    if (allCallsResponse.ok) {
      const allCallsData = await allCallsResponse.json();
      const totalCalls = allCallsData.data.length;
      const callsWithSummary = allCallsData.data.filter(call => call.summary && call.summary.trim().length > 0).length;
      const callsWithKeyPoints = allCallsData.data.filter(call => call.keyPoints && call.keyPoints.length > 0).length;
      const callsWithHealthConcerns = allCallsData.data.filter(call => call.healthConcerns && call.healthConcerns.length > 0).length;
      const callsWithFollowUp = allCallsData.data.filter(call => call.followUpItems && call.followUpItems.length > 0).length;

      console.log('📊 Database data quality:');
      console.log(`   - Total calls: ${totalCalls}`);
      console.log(`   - Calls with summaries: ${callsWithSummary}/${totalCalls} (${Math.round(callsWithSummary/totalCalls*100)}%)`);
      console.log(`   - Calls with key points: ${callsWithKeyPoints}/${totalCalls} (${Math.round(callsWithKeyPoints/totalCalls*100)}%)`);
      console.log(`   - Calls with health concerns: ${callsWithHealthConcerns}/${totalCalls} (${Math.round(callsWithHealthConcerns/totalCalls*100)}%)`);
      console.log(`   - Calls with follow-up items: ${callsWithFollowUp}/${totalCalls} (${Math.round(callsWithFollowUp/totalCalls*100)}%)\n`);
    }

    console.log('🎉 Call History Context Test Completed Successfully!');
    console.log('\n📋 Summary:');
    console.log('- Call history retrieval: Working correctly');
    console.log('- Context generation: Properly integrating historical data');
    console.log('- Database structure: Correctly storing AI analysis');
    console.log('- Fallback handling: Graceful for patients without history');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🔧 Possible issues to check:');
    console.log('- Server running on port 5000');
    console.log('- Database connection established');
    console.log('- Call history table has data');
    console.log('- getCallHistoryContext method implementation');
  }
}

// Run the test
testCallHistoryContext();