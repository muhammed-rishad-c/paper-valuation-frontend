// src/services/valuationService.js
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// URL taken from the .env file
const PYTHON_API_URL = process.env.PYTHON_API_URL; 

/**
 * Sends the uploaded file to the external Python valuation API.
 * @param {object} file - The file object provided by Multer (req.file).
 * @returns {Promise<object>} - The JSON response from the Python API.
 */
async function sendToPythonAPI(file) {
    // 1. Create a FormData instance to build the multipart request
    const form = new FormData();
    
    // 2. Read the file into a stream and append it to the form
    // The key 'paper_image' MUST match the key Flask expects (request.files['paper_image'])
    const fileStream = fs.createReadStream(file.path);
    form.append('paper_image', fileStream, path.basename(file.path));

    try {
        // 3. Send the request using Axios
        const response = await axios.post(PYTHON_API_URL, form, {
            // IMPORTANT: Node.js requires setting the Content-Type header with the boundary
            // The form-data library provides this via getHeaders()
            headers: {
                ...form.getHeaders(),
            },
            // Set a higher timeout since the Python OCR/Valuation can take time (e.g., 60 seconds)
            timeout: 60000 
        });

        return response.data;

    } catch (error) {
        console.error("Error communicating with Python API:", error.message);
        // Throw an error that the Controller can catch
        throw new Error(error.response?.data?.error || "Python service communication failed.");
    }
}

module.exports = { sendToPythonAPI };