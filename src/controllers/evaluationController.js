const fs = require('fs');
const FormData = require('form-data');
const valuationService = require('../services/valuationService');

// ============================================
// HOME PAGE
// ============================================

exports.getIndexPage = (req, res) => {
    res.render('index');
}

// ============================================
// INDIVIDUAL EVALUATION ROUTES
// ============================================

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
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            console.log(`Appending Page ${i + 1}: ${file.originalname}`);
            
            formData.append('paper_images', fs.createReadStream(file.path), {
                filename: file.originalname,
                contentType: file.mimetype
            });
        }

        console.log(`Sending ${req.files.length} pages to Flask in order...`);

        const resultData = await valuationService.sendToPythonAPI(formData,
            '/api/evaluate',
            {
            headers: {
                ...formData.getHeaders()
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

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

// ============================================
// ANSWER KEY SETUP ROUTES (NEW)
// ============================================

/**
 * GET: Render the Answer Key Setup page (3-step wizard)
 * This is where teachers define exam metadata and upload answer keys
 */
exports.getAnswerKeySetup = (req, res) => {
    res.render('answerKeySetup', { 
        title: 'Answer Key Setup',
        sessionData: req.session?.answerKeyData || null
    });
};

/**
 * POST: Extract text from a single uploaded answer key image
 * This is called via AJAX when teacher uploads each page
 * Returns extracted text immediately for teacher verification
 */
exports.postExtractAnswerKey = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ 
            status: 'Failed', 
            error: 'No image file provided.' 
        });
    }

    const answerType = req.body.answer_type || 'short'; // 'short' or 'long'
    
    console.log(`📄 Extracting ${answerType} answer key from: ${req.file.originalname}`);

    const formData = new FormData();

    try {
        formData.append('answer_key_image', fs.createReadStream(req.file.path), {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        formData.append('answer_type', answerType);

        // Call Flask endpoint for extraction only (no saving)
        const resultData = await valuationService.sendToPythonAPI(
            formData,
            '/api/extract_answer_key_text',
            {
                headers: {
                    ...formData.getHeaders()
                }
            }
        );

        console.log(`✅ Extracted ${Object.keys(resultData.answers || {}).length} answers from answer key`);

        res.json({
            status: 'Success',
            answers: resultData.answers,
            metadata: resultData.metadata
        });

    } catch (error) {
        console.error("Error extracting answer key:", error.message);
        res.status(500).json({ 
            status: 'Failed', 
            error: error.message 
        });
    } finally {
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
    }
};

/**
 * POST: Save the complete answer key with all metadata
 * Called when teacher clicks "Save Answer Key" after verifying all answers
 */
/**
 * POST: Save the complete answer key with all metadata
 * Called when teacher clicks "Save Answer Key" after verifying all answers
 */
exports.postSaveAnswerKey = async (req, res) => {
    try {
        console.log('Received body:', req.body);  // Debug log

        const {
            exam_name,
            class_name,
            subject,
            short_questions,
            long_questions,
            short_answers,
            long_answers
        } = req.body;

        console.log('💾 Saving complete answer key...');
        console.log(`   Exam: ${exam_name}, Class: ${class_name}, Subject: ${subject}`);
        console.log(`   Short answers type: ${typeof short_answers}`);
        console.log(`   Long answers type: ${typeof long_answers}`);

        // Validate data types
        if (typeof short_answers !== 'object' || typeof long_answers !== 'object') {
            return res.status(400).json({
                status: 'Failed',
                error: 'Invalid data format. Answers must be objects.'
            });
        }

        const payload = {
            exam_name,
            class_name,
            subject,
            short_questions,
            long_questions,
            short_answers: short_answers || {},
            long_answers: long_answers || {}
        };

        console.log('Sending to Flask:', JSON.stringify(payload, null, 2));  // Debug

        // Use axios directly for JSON
        const axios = require('axios');
        const PYTHON_BASE_URL = process.env.PYTHON_API_URL || "http://localhost:5000";
        
        const response = await axios.post(`${PYTHON_BASE_URL}/api/save_answer_key`, payload, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 300000
        });

        const resultData = response.data;

        console.log(`✅ Answer key saved with exam_id: ${resultData.exam_id}`);

        res.json({
            status: 'Success',
            exam_id: resultData.exam_id,
            message: 'Answer key saved successfully!'
        });

    } catch (error) {
        console.error("Error saving answer key:", error.message);
        if (error.response) {
            console.error("Flask response:", error.response.data);
        }
        res.status(500).json({ 
            status: 'Failed', 
            error: error.response?.data?.error || error.message 
        });
    }
};
// ============================================
// SERIES BATCH EVALUATION ROUTES
// ============================================

exports.getSeriesBatch = (req, res) => {
    res.render('seriesBatch', { 
        title: 'Series Batch Evaluation'
    });
};

/**
 * POST: Process batch evaluation for multiple students
 * NOW INCLUDES: exam_id to link with saved answer key
 */
exports.postEvaluateSeriesBatch = async (req, res) => {
    
    if (!req.files || req.files.length === 0) {
        return res.status(400).render('error', { message: 'No images uploaded.' });
    }

    const finalBatchResults = [];
    const studentCount = parseInt(req.body.student_count) || 0;

    try {
        console.log(`🚀 Starting Batch Processing for ${studentCount} students...`);
        
        const exam_id = req.body.exam_id || null;
        const global_class = req.body.global_class;
        const global_subject = req.body.global_subject;

        console.log(`📋 Exam ID: ${exam_id || 'Not provided'}`);

        for (let i = 0; i < studentCount; i++) {
            const studentKey = `student_${i}`;
            
            const roll_no = req.body[`roll_no_${i}`] || "";
            console.log(`Processing Student #${i + 1}, Roll No: ${roll_no || 'Auto-extract'}`);
            
            const studentFiles = req.files.filter(f => f.fieldname === studentKey);

            if (studentFiles.length === 0) {
                console.log(`⚠️ No files found for ${studentKey}, skipping.`);
                continue;
            }

            const formData = new FormData();

            formData.append("manual_roll_no", roll_no);
            formData.append("manual_class", global_class);
            formData.append("manual_subject", global_subject);
            
            if (exam_id) {
                formData.append("exam_id", exam_id);
            }

            const idPage = studentFiles[0];
            formData.append('identity_page', fs.createReadStream(idPage.path), {
                filename: idPage.originalname,
                contentType: idPage.mimetype
            });

            const answerPages = studentFiles.slice(1);
            answerPages.forEach((file) => {
                formData.append('paper_images', fs.createReadStream(file.path), {
                    filename: file.originalname,
                    contentType: file.mimetype
                });
            });

            console.log(`📦 Student #${i + 1}: 1 identity page + ${answerPages.length} answer pages`);

            try {
                const studentResult = await valuationService.sendToPythonAPI(
                    formData, 
                    '/api/seriesBundleEvaluate',
                    { headers: { ...formData.getHeaders() } }
                );

                finalBatchResults.push(studentResult);
                console.log(`✅ Successfully processed Student #${i + 1}`);
            } catch (apiError) {
                console.error(`❌ Error processing Student #${i + 1}:`, apiError.message);
                finalBatchResults.push({ 
                    status: "Failed", 
                    student_index: i, 
                    error: apiError.message 
                });
            }
        }
        console.log(`my prining is ${finalBatchResults}`);
        

        res.render('results-batch', { 
            title: 'Batch Evaluation Results',
            result: finalBatchResults,
            studentCount: finalBatchResults.length
        });

    } catch (error) {
        console.error("🔥 Critical Batch Error:", error.message);
        res.status(500).render('error', { 
            message: `Batch Processing Failed: ${error.message}` 
        });
    } finally {
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