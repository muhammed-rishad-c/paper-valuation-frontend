const fs = require('fs');
const FormData = require('form-data');
const valuationService = require('../services/valuationService');

exports.getUploadPage = (req, res) => {
    res.render('upload', { title: 'Upload Paper' });
};

exports.postEvaluate = async (req, res) => {
    // 1. Validate that files exist
    if (!req.files || req.files.length === 0) {
        return res.status(400).render('error', { message: 'Please upload at least one image file (JPEG/PNG).' });
    }

    console.log('=================================================');
    console.log('FILES RECEIVED BY NODE.JS (in order):');
    req.files.forEach((file, index) => {
        console.log(`  Page ${index + 1}: ${file.originalname}`);
    });
    console.log('=================================================');
 
    const formData = new FormData();

    try {
        // 2. CRITICAL: Append files in the EXACT ORDER they appear in req.files
        // Do NOT use forEach - use a standard for loop to guarantee order
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            console.log(`Appending Page ${i + 1}: ${file.originalname}`);
            
            formData.append('paper_images', fs.createReadStream(file.path), {
                filename: file.originalname,
                contentType: file.mimetype
            });
        }

        console.log(`Sending ${req.files.length} pages to Flask in order...`);

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