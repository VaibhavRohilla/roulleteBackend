// Test script to verify spin results functionality
const https = require('https');
const http = require('http');

const API_BASE = 'http://localhost:3001';

async function makeRequest(url, method = 'GET') {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = client.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        data: JSON.parse(data)
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        data: data
                    });
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function testSpinResultsFlow() {
    console.log('🧪 Testing Spin Results Flow...\n');

    try {
        // Test 1: Check server health
        console.log('1️⃣ Testing server health...');
        const health = await makeRequest(`${API_BASE}/health`);
        console.log(`   Status: ${health.status}`);
        console.log(`   Response:`, health.data);
        console.log('');

        // Test 2: Get current spin results
        console.log('2️⃣ Testing current spin results...');
        const results = await makeRequest(`${API_BASE}/api/last-spin-results?limit=5&includeDeleted=true`);
        console.log(`   Status: ${results.status}`);
        console.log(`   Results count: ${results.data.results?.length || 0}`);
        console.log(`   Results:`, results.data);
        console.log('');

        // Test 3: Create sample data if none exists
        if (!results.data.results || results.data.results.length === 0) {
            console.log('3️⃣ No results found, creating sample data...');
            const createSample = await makeRequest(`${API_BASE}/api/test/create-sample-spins`, 'POST');
            console.log(`   Status: ${createSample.status}`);
            console.log(`   Response:`, createSample.data);
            console.log('');

            // Test 4: Get results again after creating sample data
            console.log('4️⃣ Re-testing spin results after sample creation...');
            const newResults = await makeRequest(`${API_BASE}/api/last-spin-results?limit=5&includeDeleted=true`);
            console.log(`   Status: ${newResults.status}`);
            console.log(`   Results count: ${newResults.data.results?.length || 0}`);
            console.log(`   Results:`, newResults.data);
        }

        console.log('\n✅ Test completed successfully!');
        console.log('\n📋 Next steps:');
        console.log('   1. Start the frontend: cd ../roulletefrontend && npm run dev');
        console.log('   2. Trigger the "No Games Banner" to see the last spin results');
        console.log('   3. Check browser console for detailed debug information');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.log('\n🔧 Troubleshooting:');
        console.log('   1. Make sure the backend server is running: npm run dev');
        console.log('   2. Check if Supabase credentials are configured in .env');
        console.log('   3. Verify the database table exists and is accessible');
    }
}

// Run the test
testSpinResultsFlow(); 