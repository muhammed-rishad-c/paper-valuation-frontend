const fs = require('fs');
const FormData = require('form-data'); // Ensure this is imported
const valuationService = require('../services/valuationService');

exports.getUploadPage = (req, res) => {
    res.render('upload', { title: 'Upload Paper' });
};

exports.postEvaluate = async (req, res) => {
    // 1. Validate that files exist
    if (!req.files || req.files.length === 0) {
        return res.status(400).render('error', { message: 'Please upload at least one image file (JPEG/PNG).' });
    }
 
    const formData = new FormData();

    try {
        // 2. Append all files to the same key 'paper_images'
        req.files.forEach(file => {
            formData.append('paper_images', fs.createReadStream(file.path), {
                filename: file.originalname,
                contentType: file.mimetype
            });
        });

        console.log(`Sending ${req.files.length} pages to Flask for evaluation...`);

        // 3. Send to your service which calls the Python API
        const resultData = await valuationService.sendToPythonAPI(formData, {
            headers: {
                ...formData.getHeaders()
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        // 4. Render the results
        res.render('results', { 
            title: 'Evaluation Results',
            result: resultData,
        });

    } catch (error) {
        console.error("Error in postEvaluate:", error.message);
        const errorMessage = error.response?.data?.error || "Failed to connect to the evaluation service.";
        res.status(500).render('upload', { 
            error: `System Error: ${errorMessage}` 
        });
    } finally {
        // 5. Cleanup: Delete local files after processing
        if (req.files) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlink(file.path, (err) => {
                        if (err) console.error("Cleanup error:", err);
                    });
                }
            });
        }
    }
};