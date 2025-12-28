const axios = require('axios');

// Define your base Python API URL (e.g., http://localhost:5000)
const PYTHON_BASE_URL = "http://localhost:5000";

/**
 * Sends multi-part form data to specific Python Flask API routes.
 * @param {FormData} formData - The populated FormData object.
 * @param {string} endpoint - The specific route (e.g., '/api/evaluate' or '/seriesBundleEvaluate').
 * @param {Object} options - Headers provided by formData.getHeaders().
 */
async function sendToPythonAPI(formData, endpoint, options = {}) {
    // Construct the full URL based on the requested endpoint
    const targetUrl = `${PYTHON_BASE_URL}${endpoint}`;
    
    try {
        console.log(`📡 Sending request to Python API: ${targetUrl}`);
        
        const response = await axios.post(targetUrl, formData, {
            headers: {
                ...options.headers,
            },
            // Increase timeout to 5 minutes (300000ms) for large batch processing
            timeout: 300000, 
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        return response.data;

    } catch (error) {
        console.error(`❌ Error communicating with Python API at ${endpoint}:`, error.message);
        
        const errorMessage = error.response?.data?.error || "Python service communication failed.";
        throw new Error(errorMessage);
    }
}

module.exports = { sendToPythonAPI };