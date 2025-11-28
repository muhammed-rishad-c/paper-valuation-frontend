// src/controllers/evaluationController.js
const fs = require('fs');
const valuationService = require('../services/valuationService');

// Renders the initial upload form
exports.getUploadPage = (req, res) => {
    res.render('upload', { title: 'Upload Paper' });
};

// Handles the POST request to evaluate the paper
exports.postEvaluate = async (req, res) => {
    // Multer places the file here: req.file
    if (!req.file) {
        return res.status(400).render('error', { message: 'Please upload an image file (JPEG/PNG).' });
    }

    const uploadedFile = req.file;

    try {
        // 1. Call the service to send the file to the Python API
        const resultData = await valuationService.sendToPythonAPI(uploadedFile);
        
        // 2. Render the results page with the data received from Python
        res.render('results', { 
            title: 'Evaluation Results',
            result: resultData,
            fileName: uploadedFile.originalname,
        });

    } catch (error) {
        console.error("Controller Error:", error.message);
        res.status(500).render('error', { message: error.message || 'An unknown error occurred during valuation.' });

    } finally {
        // 3. CLEANUP: Delete the file from the local 'uploads' directory immediately
        fs.unlink(uploadedFile.path, (err) => {
            if (err) console.error("Failed to delete temp file:", err);
        });
    }
};