
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');


const PYTHON_API_URL = process.env.PYTHON_API_URL; 


async function sendToPythonAPI(file) {

    const form = new FormData();

    const fileStream = fs.createReadStream(file.path);
    form.append('paper_image', fileStream, path.basename(file.path));

    try {

        const response = await axios.post(PYTHON_API_URL, form, {
            
            headers: {
                ...form.getHeaders(),
            },
            
            timeout: 60000 
        });

        return response.data;

    } catch (error) {
        console.error("Error communicating with Python API:", error.message);
        
        throw new Error(error.response?.data?.error || "Python service communication failed.");
    }
}

module.exports = { sendToPythonAPI };