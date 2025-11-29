
const fs = require('fs');
const valuationService = require('../services/valuationService');


exports.getUploadPage = (req, res) => {
    res.render('upload', { title: 'Upload Paper' });
};

exports.postEvaluate = async (req, res) => {
    if (!req.file) {
        return res.status(400).render('error', { message: 'Please upload an image file (JPEG/PNG).' });
    }

    const uploadedFile = req.file;

    try {
        const resultData = await valuationService.sendToPythonAPI(uploadedFile);
        
        res.render('results', { 
            title: 'Evaluation Results',
            result: resultData,
            fileName: uploadedFile.originalname,
        });

    } catch (error) {
        console.error("Controller Error:", error.message);
        res.status(500).render('error', { message: error.message || 'An unknown error occurred during valuation.' });

    } finally {
        fs.unlink(uploadedFile.path, (err) => {
            if (err) console.error("Failed to delete temp file:", err);
        });
    }
};