const fs = require('fs');
const FormData = require('form-data');
const valuationService = require('../services/valuationService');


exports.getIndexPage = (req, res) => {
    res.render('index');
}


exports.getUploadPage = (req, res) => {
    res.render('individual', { title: 'Upload Paper' });
};

exports.postEvaluate = async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).render('error', { message: 'Please upload at least one image file (JPEG/PNG).' });
    }

    // 🆕 NEW: Get exam_id from request
    const exam_id = req.body.exam_id;

    if (!exam_id) {
        return res.status(400).render('error', { 
            message: 'Please select an exam before uploading papers.' 
        });
    }

    console.log('=================================================');
    console.log(`📋 INDIVIDUAL EVALUATION - Exam ID: ${exam_id}`);
    console.log('FILES RECEIVED BY NODE.JS (in order):');
    req.files.forEach((file, index) => {
        console.log(`  Page ${index + 1}: ${file.originalname}`);
    });
    console.log('=================================================');

    const formData = new FormData();

    try {
        // Append exam_id
        formData.append('exam_id', exam_id);

        // Append files
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            console.log(`Appending Page ${i + 1}: ${file.originalname}`);

            formData.append('paper_images', fs.createReadStream(file.path), {
                filename: file.originalname,
                contentType: file.mimetype
            });
        }

        console.log(`Sending ${req.files.length} pages to Flask for evaluation...`);

        // 🆕 NEW: Call new Flask endpoint for individual evaluation
        const resultData = await valuationService.sendToPythonAPI(formData,
            '/api/evaluate_individual',  // 🆕 NEW ENDPOINT
            {
                headers: {
                    ...formData.getHeaders()
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

        // 🆕 NEW: Render upgraded results page
        res.render('results', {
            title: 'Evaluation Results',
            result: resultData,
            isIndividual: true  // Flag to distinguish from series results
        });

    } catch (error) {
        console.error("Error in postEvaluate:", error.message);
        const errorMessage = error.response?.data?.error || "Failed to connect to the evaluation service.";
        res.status(500).render('error', {
            message: `System Error: ${errorMessage}`
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


exports.getAnswerKeySetup = (req, res) => {
    res.render('answerKeySetup', {
        title: 'Answer Key Setup',
        sessionData: req.session?.answerKeyData || null
    });
};


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


exports.postSaveAnswerKey = async (req, res) => {
    try {
        console.log('Received body:', req.body);

        const {
            exam_name,
            class_name,
            subject,
            short_questions,
            long_questions,
            short_marks,
            long_marks,
            short_answers,
            long_answers,
            or_groups              // 🆕 ADD THIS
        } = req.body;

        console.log('💾 Saving complete answer key with marks...');
        console.log(`   Exam: ${exam_name}, Class: ${class_name}, Subject: ${subject}`);
        console.log(`   Short marks: ${short_marks}, Long marks: ${long_marks}`);
        console.log(`   OR Groups: ${JSON.stringify(or_groups)}`);  // 🆕 ADD THIS

        // Validate data types
        if (typeof short_answers !== 'object' || typeof long_answers !== 'object') {
            return res.status(400).json({
                status: 'Failed',
                error: 'Invalid data format. Answers must be objects.'
            });
        }

        // Validate marks are provided
        if (!short_marks && !long_marks) {
            return res.status(400).json({
                status: 'Failed',
                error: 'Please provide marks for at least one question type.'
            });
        }

        const payload = {
            exam_name,
            class_name,
            subject,
            short_questions,
            long_questions,
            short_marks: short_marks || '',
            long_marks: long_marks || '',
            short_answers: short_answers || {},
            long_answers: long_answers || {},
            or_groups: or_groups || []   // 🆕 ADD THIS
        };

        console.log('Sending to Flask:', JSON.stringify(payload, null, 2));

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
        console.log(`📊 Total marks: ${resultData.total_marks}`);
        if (resultData.or_groups_count > 0) {
            console.log(`⚡ OR Groups saved: ${resultData.or_groups_count}`);
        }
 
        res.json({
            status: 'Success',
            exam_id: resultData.exam_id,
            total_marks: resultData.total_marks,
            question_count: resultData.question_count,
            or_groups_count: resultData.or_groups_count || 0,  // 🆕 ADD THIS
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

        console.log(`📋 Exam ID: ${exam_id || 'Not provided (submissions will not be saved)'}`);

        // 🆕 NEW: Validate exam_id exists before processing
        if (exam_id) {
            try {
                const axios = require('axios');
                const PYTHON_BASE_URL = process.env.PYTHON_API_URL || "http://localhost:5000";
                const checkExam = await axios.get(`${PYTHON_BASE_URL}/api/get_answer_key/${exam_id}`);

                if (checkExam.data.status === 'Success') {
                    console.log(`✅ Exam validated: ${checkExam.data.answer_key.exam_metadata?.exam_name || checkExam.data.answer_key.exam_name}`);
                }
            } catch (examError) {
                console.error(`❌ Invalid exam_id: ${exam_id}`);
                return res.status(400).render('error', {
                    message: `Invalid Exam ID: ${exam_id}. Please create the answer key first.`
                });
            }
        }

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

                // 🆕 NEW: Log if submission was saved to exam
                if (studentResult.saved_to_exam) {
                    console.log(`✅ Student #${i + 1} saved to exam: ${studentResult.saved_to_exam}`);
                } else {
                    console.log(`⚠️ Student #${i + 1} processed but not saved to exam storage`);
                }

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

        console.log(`📊 Batch Results Summary: ${finalBatchResults.length} students processed`);

        // 🆕 NEW: Add exam info to results page
        let examInfo = null;
        if (exam_id && finalBatchResults.some(r => r.status === 'Success')) {
            examInfo = {
                exam_id: exam_id,
                student_count: finalBatchResults.filter(r => r.status === 'Success').length
            };
        }

        res.render('results-batch', {
            title: 'Batch Evaluation Results',
            result: finalBatchResults,
            studentCount: finalBatchResults.length,
            examInfo: examInfo  // 🆕 NEW: Pass exam info to template
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

// ============================================
// VALUATION PREPARATION ROUTE
// ============================================

exports.getValuationPrep = async (req, res) => {
    const exam_id = req.params.exam_id;

    try {
        console.log(`📋 Fetching complete exam data for: ${exam_id}`);

        const axios = require('axios');
        const PYTHON_BASE_URL = process.env.PYTHON_API_URL || "http://localhost:5000";

        const response = await axios.get(`${PYTHON_BASE_URL}/api/get_exam_data/${exam_id}`);

        if (response.data.status !== 'Success') {
            return res.status(404).render('error', {
                message: `Exam not found: ${exam_id}`
            });
        }

        const examData = response.data.exam_data;

        console.log(`✅ Retrieved exam: ${examData.exam_metadata.exam_name}`);
        console.log(`   📊 ${examData.total_students} student submissions found`);

        // Prepare valuation-ready format
        const valuationPayload = {
            exam_metadata: examData.exam_metadata,
            question_types: examData.question_types,
            question_marks: examData.question_marks,
            teacher_answers: examData.teacher_answers,
            students: []
        };

        // Convert student submissions to array for easier rendering
        for (const [roll_no, submission] of Object.entries(examData.student_submissions)) {
            valuationPayload.students.push({
                roll_no: roll_no,
                name: submission.student_info.name,
                student_info: submission.student_info,
                answers: submission.answers,
                valuation_status: submission.valuation_status
            });
        }

        res.render('valuation-prep', {
            title: `Valuation: ${examData.exam_metadata.exam_name}`,
            examData: valuationPayload
        });

    } catch (error) {
        console.error("Error fetching exam data:", error.message);
        res.status(500).render('error', {
            message: `Failed to load exam data: ${error.message}`
        });
    }
};

// ============================================
// GET ANSWER KEYS LIST FOR DROPDOWN
// ============================================

exports.getAnswerKeysList = async (req, res) => {
    try {
        const axios = require('axios');
        const PYTHON_BASE_URL = process.env.PYTHON_API_URL || "http://localhost:5000";

        const response = await axios.get(`${PYTHON_BASE_URL}/api/list_answer_keys`);
        res.json(response.data);

    } catch (error) {
        console.error('Error fetching answer keys list:', error.message);
        res.status(500).json({
            status: 'Failed',
            error: error.message
        });
    }
};

// ============================================
// POST: Evaluate all students in an exam using AI
// ============================================

exports.postEvaluateExam = async (req, res) => {
    const exam_id = req.params.exam_id;

    try {
        console.log(`${'='.repeat(50)}`);
        console.log(`🎯 Starting AI Valuation for Exam: ${exam_id}`);
        console.log(`${'='.repeat(50)}`);

        const axios = require('axios');
        const PYTHON_BASE_URL = process.env.PYTHON_API_URL || "http://localhost:5000";

        // Call Flask evaluation endpoint
        const response = await axios.post(
            `${PYTHON_BASE_URL}/api/evaluate_exam/${exam_id}`,
            {},
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 300000 // 5 minutes timeout for large batches
            }
        );

        if (response.data.status === 'Success') {
            console.log(`✅ AI Valuation Completed Successfully`);
            console.log(`   📊 Total Students: ${response.data.total_students}`);
            console.log(`   ✅ Evaluated: ${response.data.evaluated_successfully}`);
            console.log(`   ❌ Failed: ${response.data.evaluation_failed}`);
            console.log(`${'='.repeat(50)}`);

            res.json(response.data);
        } else {
            console.error(`❌ Valuation failed: ${response.data.error}`);
            res.status(400).json(response.data);
        }

    } catch (error) {
        console.error(`🔥 Critical Error during AI valuation:`, error.message);

        if (error.response) {
            console.error(`Flask Response Error:`, error.response.data);
        }

        res.status(500).json({
            status: 'Failed',
            error: error.response?.data?.error || error.message
        });
    }
};