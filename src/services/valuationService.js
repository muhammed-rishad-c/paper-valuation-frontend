const axios = require('axios');

// The URL should point to your Flask server (e.g., http://localhost:5000/api/evaluate)
const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:5000/api/evaluate"; 

/**
 * Sends multi-part form data containing multiple images to the Python Flask API.
 * @param {FormData} formData - The populated FormData object from the controller.
 * @param {Object} options - Headers and configurations (like maxBodyLength).
 */
async function sendToPythonAPI(formData, options = {}) {
    try {
        // We pass the formData directly. The 'options' argument contains 
        // the necessary multi-part boundaries in the headers.
        const response = await axios.post(PYTHON_API_URL, formData, {
            headers: {
                ...options.headers,
            },
            // Increase timeouts for multiple pages as OCR takes time
            timeout: 90000, 
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        return response.data;

    } catch (error) {
        console.error("Error communicating with Python API:", error.message);
        
        // Provide clear feedback if the Flask service is down or errors out
        const errorMessage = error.response?.data?.error || "Python service communication failed.";
        throw new Error(errorMessage);
    }
}

module.exports = { sendToPythonAPI };