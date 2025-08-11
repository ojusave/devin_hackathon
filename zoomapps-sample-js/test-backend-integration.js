import fetch from 'node-fetch';

// Test the zoom-code backend integration
const ZOOM_CODE_BACKEND_URL = 'http://localhost:8000';

async function testBackendConnection() {
    console.log('🧪 TESTING ZOOM-CODE BACKEND INTEGRATION...\n');

    // Test 1: Health check
    try {
        console.log('1️⃣ Testing health endpoint...');
        const healthResponse = await fetch(`${ZOOM_CODE_BACKEND_URL}/health`);
        
        if (healthResponse.ok) {
            const healthData = await healthResponse.json();
            console.log('✅ Health check passed:', healthData);
        } else {
            console.log('❌ Health check failed:', healthResponse.status);
            return;
        }
    } catch (error) {
        console.log('❌ Backend not reachable:', error.message);
        console.log('💡 Make sure your Python backend is running: python api.py');
        return;
    }

    // Test 2: Execute endpoint with sample action item
    try {
        console.log('\n2️⃣ Testing execute endpoint with sample action item...');
        
        const sampleActionItem = {
            query: `Create a meeting with the following details:
Task Type: meeting
Description: Schedule weekly team standup meeting
Suggested Action: Create recurring meeting for Mondays at 10 AM
Confidence: 0.85
Meeting UUID: test-meeting-123
Timestamp: ${new Date().toISOString()}
Relevant Speakers: John Doe, Jane Smith

Context from meeting:
John Doe: We should set up a weekly standup meeting
Jane Smith: Yes, let's do it every Monday at 10 AM
John Doe: That works for me

Please process this action item and create the appropriate task or item as requested.`
        };

        const executeResponse = await fetch(`${ZOOM_CODE_BACKEND_URL}/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(sampleActionItem)
        });

        if (executeResponse.ok) {
            const executeData = await executeResponse.json();
            console.log('✅ Execute endpoint test passed:', executeData);
        } else {
            console.log('❌ Execute endpoint failed:', executeResponse.status);
            const errorText = await executeResponse.text();
            console.log('Error details:', errorText);
        }

    } catch (error) {
        console.log('❌ Execute endpoint test failed:', error.message);
    }

    console.log('\n🎉 Backend integration test completed!');
}

// Run the test
testBackendConnection().catch(console.error);
