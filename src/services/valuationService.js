const axios = require('axios');


const PYTHON_BASE_URL = "http://localhost:5000";

/**
 * @param {FormData} formData 
 * @param {string} endpoint 
 * @param {Object} options 
 */


async function sendToPythonAPI(formData, endpoint, options = {}) {
    
    const targetUrl = `${PYTHON_BASE_URL}${endpoint}`;
    
    try {
        
        
        const response = await axios.post(targetUrl, formData, {
            headers: {
                ...options.headers,
            },
            
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