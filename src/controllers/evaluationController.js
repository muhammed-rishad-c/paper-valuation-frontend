const fs = require('fs');
const FormData = require('form-data');
const valuationService = require('../services/valuationService');

exports.getIndexPage=(req,res)=>{
    res.render('index');
}

exports.getUploadPage = (req, res) => {
    res.render('individual', { title: 'Upload Paper' });
};

exports.postEvaluate = async (req, res) => {
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
        const resultData = await valuationService.sendToPythonAPI(formData,
            '/api/evaluate',
            {
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

exports.getTeacherKeySetup=(req,res)=>{
    res.render('teacherKeySetup.ejs')
}

exports.getSeriesBatch=(req,res)=>{
    res.render('seriesBatch.ejs')
}

exports.postEvaluateSeriesBatch = async (req, res) => {
    
    if (!req.files || req.files.length === 0) {
        return res.status(400).render('error', { message: 'No images uploaded.' });
    }

    const finalBatchResults = [];
    const studentCount = parseInt(req.body.student_count) || 0;

    try {
        console.log(`🚀 Starting Batch Processing for ${studentCount} students...`);
        const global_class=req.body.global_class
        const global_subject=req.body.global_subject

        
        

        
        for (let i = 0; i < studentCount; i++) {
            const studentKey = `student_${i}`;
            
            const roll_no=req.body[`roll_no_${i}`] || "";
            console.log(`roll no is ${roll_no}`);
            
            
            const studentFiles = req.files.filter(f => f.fieldname === studentKey);

            if (studentFiles.length === 0) {
                console.log(`⚠️ No files found for ${studentKey}, skipping.`);
                continue;
            }

            const formData = new FormData();

            formData.append("manual_roll_no",roll_no)
            formData.append("manual_class",global_class)
            formData.append("manual_subject",global_subject)

            // 3. Identification: The FIRST file is the Identity Page
            const idPage = studentFiles[0];
            formData.append('identity_page', fs.createReadStream(idPage.path), {
                filename: idPage.originalname,
                contentType: idPage.mimetype
            });

            // 4. Answers: The REMAINING files are Answer Pages
            const answerPages = studentFiles.slice(1);
            answerPages.forEach((file) => {
                formData.append('paper_images', fs.createReadStream(file.path), {
                    filename: file.originalname,
                    contentType: file.mimetype
                });
            });

            console.log(`📦 Processing Student #${i + 1}: ${answerPages.length} answer pages found.`);

            
             

            // 5. Call Flask API for this individual student
            try {
                // Inside exports.postEvaluateSeriesBatch
                const studentResult = await valuationService.sendToPythonAPI(
                    formData, 
                    '/api/seriesBundleEvaluate', // The Teacher Bundle Route
                    { headers: { ...formData.getHeaders() } }
                );

                finalBatchResults.push(studentResult);
            } catch (apiError) {
                console.error(`❌ Error processing Student #${i + 1}:`, apiError.message);
                // Push a placeholder so the batch continues
                finalBatchResults.push({ 
                    status: "Failed", 
                    student_index: i, 
                    error: apiError.message 
                });
            }
        }

        // 6. Final Render: Send the merged results to your results-batch view
        res.render('results-batch', { 
            title: 'Batch Evaluation Results',
            result: finalBatchResults, // This is the array of all students
            studentCount: finalBatchResults.length
        });

    } catch (error) {
        console.error("🔥 Critical Batch Error:", error.message);
        res.status(500).render('series-bundle', { 
            error: `Batch Processing Failed: ${error.message}` 
        });
    } finally {
        // 7. Cleanup: Delete all temporary files from the uploads folder
        if (req.files) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
            console.log("🧹 Uploaded temporary files cleaned up.");
        }
    }
};