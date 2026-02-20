const fs = require('fs');
const FormData = require('form-data');
const valuationService = require('../services/valuationService');

// Add database models
const { Exam, Question, OrGroup, Submission, StudentAnswer } = require('../config/models');

// Add helper functions
const { generateExamId, parseQuestionRange, parseMarksString } = require('../utils/examHelpers');


exports.getIndexPage = (req, res) => {
    res.render('index');
}

exports.getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.user_id;

        // Get total exams
        const totalExams = await Exam.count({
            where: { user_id: userId }
        });

        // Get total students (unique submissions)
        const totalStudents = await Submission.count({
            include: [{
                model: Exam,
                as: 'exam',
                where: { user_id: userId },
                attributes: []
            }]
        });

        // Get completed evaluations
        const completedEvaluations = await Submission.count({
            where: { valuation_status: 'completed' },
            include: [{
                model: Exam,
                as: 'exam',
                where: { user_id: userId },
                attributes: []
            }]
        });

        // Calculate average percentage
        const avgResult = await Submission.findOne({
            attributes: [
                [sequelize.fn('AVG', sequelize.col('percentage')), 'avg_percentage']
            ],
            where: {
                valuation_status: 'completed',
                percentage: { [sequelize.Op.ne]: null }
            },
            include: [{
                model: Exam,
                as: 'exam',
                where: { user_id: userId },
                attributes: []
            }],
            raw: true
        });

        const avgPercentage = parseFloat(avgResult?.avg_percentage || 0);

        // Get recent activity (last 10 submissions)
        const recentSubmissions = await Submission.findAll({
            include: [{
                model: Exam,
                as: 'exam',
                where: { user_id: userId },
                attributes: ['exam_name', 'class', 'subject']
            }],
            order: [['created_at', 'DESC']],
            limit: 10
        });

        const recentActivity = recentSubmissions.map(sub => ({
            title: `${sub.exam.exam_name} - ${sub.student_name || 'Roll ' + sub.roll_no}`,
            details: `${sub.exam.class} ${sub.exam.subject} | Status: ${sub.valuation_status}${sub.percentage ? ` | Score: ${sub.percentage}%` : ''}`,
            date: new Date(sub.created_at).toLocaleDateString()
        }));

        res.json({
            status: 'Success',
            stats: {
                total_exams: totalExams,
                total_students: totalStudents,
                completed_evaluations: completedEvaluations,
                avg_percentage: avgPercentage
            },
            recent_activity: recentActivity
        });

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({
            status: 'Failed',
            error: error.message
        });
    }
};

exports.getUploadPage = (req, res) => {
    res.render('individual', { title: 'Upload Paper' });
};

exports.getProfile = (req, res) => {
    res.render('profile', {
        title: 'Profile',
        user: req.user
    });
};

exports.getHistory = (req, res) => {
    res.render('history', {
        title: 'History',
        user: req.user
    });
};

exports.getHistoryData = async (req, res) => {
    try {
        const userId = req.user.user_id;

        const exams = await Exam.findAll({
            where: { user_id: userId },
            include: [{
                model: Submission,
                as: 'submissions',
                attributes: ['submission_id', 'valuation_status', 'percentage']
            }],
            order: [['created_at', 'DESC']]
        });

        const examsWithStats = exams.map(exam => {
            const submissions = exam.submissions || [];
            const completed = submissions.filter(s => s.valuation_status === 'completed');
            const avgPercentage = completed.length > 0
                ? completed.reduce((sum, s) => sum + (parseFloat(s.percentage) || 0), 0) / completed.length
                : 0;

            return {
                exam_id: exam.exam_id,
                exam_name: exam.exam_name,
                class: exam.class,
                subject: exam.subject,
                total_marks: exam.total_marks,
                created_at: exam.created_at,
                submissions_count: submissions.length,
                completed_count: completed.length,
                avg_percentage: avgPercentage
            };
        });

        res.json({
            status: 'Success',
            exams: examsWithStats
        });

    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({
            status: 'Failed',
            error: error.message
        });
    }
};

exports.postEvaluate = async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).render('error', {
            message: 'Please upload at least one image file (JPEG/PNG).'
        });
    }

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

    try {
        // Load exam from PostgreSQL
        const exam = await Exam.findOne({
            where: {
                exam_id: exam_id,
                user_id: req.user.user_id  // Ownership check
            },
            include: [
                { model: Question, as: 'questions' },
                { model: OrGroup, as: 'or_groups' }
            ]
        });

        if (!exam) {
            return res.status(400).render('error', {
                message: `Invalid Exam ID: ${exam_id}. You do not own this exam or it does not exist.`
            });
        }

        console.log(`✅ Exam validated: ${exam.exam_name}`);

        // Format exam data for Python
        const examData = {
            exam_id: exam.exam_id,
            exam_name: exam.exam_name,
            class: exam.class,
            subject: exam.subject,
            total_marks: exam.total_marks,
            question_types: {},
            question_marks: {},
            teacher_answers: {},
            or_groups: []
        };

        // Add questions
        exam.questions.forEach(q => {
            examData.question_types[q.question_number.toString()] = q.question_type;
            examData.question_marks[q.question_number.toString()] = q.max_marks;
            examData.teacher_answers[`Q${q.question_number}`] = q.teacher_answer;
        });

        // Add OR groups
        exam.or_groups.forEach(g => {
            examData.or_groups.push({
                type: g.group_type,
                options: JSON.parse(g.option_a),
                option_b: g.option_b ? JSON.parse(g.option_b) : []
            });
        });

        console.log(`📤 Sending ${req.files.length} pages + exam data to Python...`);

        // Create FormData for Python
        const formData = new FormData();

        // Send complete exam data as JSON string
        formData.append('exam_data', JSON.stringify(examData));

        // Append image files
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            formData.append('paper_images', fs.createReadStream(file.path), {
                filename: file.originalname,
                contentType: file.mimetype
            });
        }

        // Send to Python
        const resultData = await valuationService.sendToPythonAPI(
            formData,
            '/api/evaluate_individual_with_data',  // New endpoint
            {
                headers: {
                    ...formData.getHeaders()
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        console.log('✅ Evaluation completed successfully');

        // Render results
        res.render('results', {
            title: 'Evaluation Results',
            result: resultData,
            isIndividual: true
        });

    } catch (error) {
        console.error("Error in postEvaluate:", error.message);
        const errorMessage = error.response?.data?.error || "Failed to connect to the evaluation service.";
        res.status(500).render('error', {
            message: `System Error: ${errorMessage}`
        });
    } finally {
        // Cleanup uploaded files
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
            or_groups
        } = req.body;

        console.log(`💾 Saving answer key: ${exam_name} for user ${req.user.username}`);

        // Validate required fields
        if (!exam_name || !class_name || !subject) {
            return res.status(400).json({
                status: 'Failed',
                error: 'Missing required fields: exam_name, class_name, or subject'
            });
        }

        // Parse question ranges
        const shortQuestions = short_questions ? parseQuestionRange(short_questions) : [];
        const longQuestions = long_questions ? parseQuestionRange(long_questions) : [];

        if (shortQuestions.length === 0 && longQuestions.length === 0) {
            return res.status(400).json({
                status: 'Failed',
                error: 'Please specify at least one question range'
            });
        }

        // Parse marks
        let shortMarksList = [];
        let longMarksList = [];
        let totalMarks = 0;

        if (shortQuestions.length > 0) {
            if (!short_marks) {
                return res.status(400).json({
                    status: 'Failed',
                    error: 'Short questions specified but no marks provided'
                });
            }
            shortMarksList = parseMarksString(short_marks, shortQuestions.length);
            totalMarks += shortMarksList.reduce((a, b) => a + b, 0);
        }

        if (longQuestions.length > 0) {
            if (!long_marks) {
                return res.status(400).json({
                    status: 'Failed',
                    error: 'Long questions specified but no marks provided'
                });
            }
            longMarksList = parseMarksString(long_marks, longQuestions.length);
            totalMarks += longMarksList.reduce((a, b) => a + b, 0);
        }

        // Generate exam ID
        const exam_id = generateExamId(exam_name, class_name, subject);

        console.log(`   📊 ${shortQuestions.length} short + ${longQuestions.length} long questions`);
        console.log(`   💯 Total marks: ${totalMarks}`);

        // Use transaction for data integrity
        const { sequelize } = require('../config/models');

        await sequelize.transaction(async (transaction) => {

            // 1. Create Exam
            await Exam.create({
                exam_id: exam_id,
                user_id: req.user.user_id,  // Link to current user
                exam_name: exam_name,
                class: class_name,
                subject: subject,
                total_marks: totalMarks
            }, { transaction });

            // 2. Create Questions
            const questionsToCreate = [];

            // Short questions
            for (let i = 0; i < shortQuestions.length; i++) {
                const qNum = shortQuestions[i];
                const qLabel = `Q${qNum}`;
                questionsToCreate.push({
                    exam_id: exam_id,
                    question_number: qNum,
                    question_type: 'short',
                    max_marks: shortMarksList[i],
                    teacher_answer: short_answers[qLabel] || ''
                });
            }

            // Long questions
            for (let i = 0; i < longQuestions.length; i++) {
                const qNum = longQuestions[i];
                const qLabel = `Q${qNum}`;
                questionsToCreate.push({
                    exam_id: exam_id,
                    question_number: qNum,
                    question_type: 'long',
                    max_marks: longMarksList[i],
                    teacher_answer: long_answers[qLabel] || ''
                });
            }

            await Question.bulkCreate(questionsToCreate, { transaction });

            // 3. Create OR Groups
            if (or_groups && or_groups.length > 0) {
                const orGroupsToCreate = [];

                for (const group of or_groups) {
                    orGroupsToCreate.push({
                        exam_id: exam_id,
                        group_type: group.type,
                        option_a: JSON.stringify(group.options || group.option_a || []),
                        option_b: JSON.stringify(group.option_b || [])
                    });
                }

                await OrGroup.bulkCreate(orGroupsToCreate, { transaction });
                console.log(`   ⚡ ${or_groups.length} OR groups saved`);
            }
        });

        console.log(`✅ Answer key saved: ${exam_id}`);

        res.json({
            status: 'Success',
            exam_id: exam_id,
            total_marks: totalMarks,
            question_count: shortQuestions.length + longQuestions.length,
            or_groups_count: or_groups ? or_groups.length : 0,
            message: 'Answer key saved successfully!'
        });

    } catch (error) {
        console.error('Error saving answer key:', error.message);
        res.status(500).json({
            status: 'Failed',
            error: error.message
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
        console.log(`\n${'='.repeat(70)}`);
        console.log(`🚀 Starting Batch Processing for ${studentCount} students...`);
        console.log('='.repeat(70));

        const exam_id = req.body.exam_id || null;
        const global_class = req.body.global_class;
        const global_subject = req.body.global_subject;

        console.log(`📋 Exam ID: ${exam_id || 'Not provided (submissions will not be saved)'}`);

        // ============================================
        // VALIDATE AND LOAD EXAM FROM DATABASE
        // ============================================
        let examData = null;
        if (exam_id) {
            try {
                const exam = await Exam.findOne({
                    where: {
                        exam_id: exam_id,
                        user_id: req.user.user_id
                    },
                    include: [
                        { model: Question, as: 'questions' },
                        { model: OrGroup, as: 'or_groups' }
                    ]
                });

                if (!exam) {
                    return res.status(400).render('error', {
                        message: `Invalid Exam ID: ${exam_id}. You do not own this exam or it does not exist.`
                    });
                }

                console.log(`✅ Exam validated: ${exam.exam_name}`);
                console.log(`   Questions: ${exam.questions.length}`);
                console.log(`   OR Groups: ${exam.or_groups.length}`);

                // Format exam data for Python
                examData = {
                    exam_id: exam.exam_id,
                    exam_name: exam.exam_name,
                    question_types: {},
                    question_marks: {},
                    teacher_answers: {},
                    or_groups: []
                };

                // Add questions
                exam.questions.forEach(q => {
                    examData.question_types[q.question_number.toString()] = q.question_type;
                    examData.question_marks[q.question_number.toString()] = q.max_marks;
                    examData.teacher_answers[`Q${q.question_number}`] = q.teacher_answer;
                });

                // Add OR groups
                exam.or_groups.forEach(g => {
                    examData.or_groups.push({
                        type: g.group_type,
                        options: JSON.parse(g.option_a),
                        option_b: g.option_b ? JSON.parse(g.option_b) : []
                    });
                });

            } catch (examError) {
                console.error(`❌ Error loading exam: ${examError.message}`);
                return res.status(400).render('error', {
                    message: `Failed to load exam: ${examError.message}`
                });
            }
        }

        // ============================================
        // PROCESS EACH STUDENT
        // ============================================
        for (let i = 0; i < studentCount; i++) {
            const studentKey = `student_${i}`;
            const roll_no = req.body[`roll_no_${i}`] || "";

            console.log(`\n${'='.repeat(60)}`);
            console.log(`Processing Student #${i + 1} of ${studentCount}`);
            console.log(`Roll No: ${roll_no || 'Auto-extract'}`);
            console.log('='.repeat(60));

            const studentFiles = req.files.filter(f => f.fieldname === studentKey);

            if (studentFiles.length === 0) {
                console.log(`⚠️ No files found for ${studentKey}, skipping.`);
                continue;
            }

            // ============================================
            // PREPARE FORMDATA FOR PYTHON
            // ============================================
            const formData = new FormData();

            formData.append("manual_roll_no", roll_no);
            formData.append("manual_class", global_class);
            formData.append("manual_subject", global_subject);

            // Send complete exam data to Python
            if (examData) {
                formData.append("exam_data", JSON.stringify(examData));
            }

            // Identity page (first file)
            const idPage = studentFiles[0];
            formData.append('identity_page', fs.createReadStream(idPage.path), {
                filename: idPage.originalname,
                contentType: idPage.mimetype
            });

            // Answer pages (remaining files)
            const answerPages = studentFiles.slice(1);
            answerPages.forEach((file) => {
                formData.append('paper_images', fs.createReadStream(file.path), {
                    filename: file.originalname,
                    contentType: file.mimetype
                });
            });

            console.log(`📦 Files: 1 identity page + ${answerPages.length} answer pages`);

            // ============================================
            // STEP 1: CALL PYTHON API FOR OCR
            // ============================================
            let studentResult = null;

            try {
                console.log(`📤 Sending to Python for OCR processing...`);

                studentResult = await valuationService.sendToPythonAPI(
                    formData,
                    '/api/seriesBundleEvaluate',
                    {
                        headers: { ...formData.getHeaders() },
                        timeout: 120000
                    }
                );

                console.log(`✅ Python processing completed`);
                console.log(`   Status: ${studentResult.status}`);

                if (studentResult.status === 'Success') {
                    console.log(`   Extracted Roll No: ${studentResult.student_info.roll_no}`);
                    console.log(`   Student Name: ${studentResult.student_info.name || 'Unknown'}`);
                    console.log(`   Answers extracted: ${Object.keys(studentResult.recognition_result.answers).length}`);
                }

            } catch (apiError) {
                console.error(`❌ Python API Error for Student #${i + 1}:`);
                console.error(`   Message: ${apiError.message}`);

                finalBatchResults.push({
                    status: "Failed",
                    student_index: i + 1,
                    roll_no: roll_no || 'Unknown',
                    error: `OCR Processing Failed: ${apiError.message}`
                });

                console.log(`⏭️  Skipping to next student...`);
                continue;
            }

            // ============================================
            // STEP 2: SAVE TO DATABASE
            // ============================================
            if (studentResult && studentResult.status === 'Success' && exam_id) {
                try {
                    console.log(`💾 Saving to PostgreSQL database...`);

                    const extractedRollNo = studentResult.student_info.roll_no;
                    const extractedName = studentResult.student_info.name || 'Unknown';

                    console.log(`   Roll No: ${extractedRollNo}`);
                    console.log(`   Name: ${extractedName}`);

                    // Check if student already exists
                    const existingSubmission = await Submission.findOne({
                        where: {
                            exam_id: exam_id,
                            roll_no: extractedRollNo
                        }
                    });

                    if (existingSubmission) {
                        console.log(`   ⚠️  Student ${extractedRollNo} already exists in this exam`);
                        console.log(`   ⚠️  Skipping database save (duplicate entry)`);
                    } else {
                        // Create submission
                        const submission = await Submission.create({
                            exam_id: exam_id,
                            roll_no: extractedRollNo,
                            student_name: extractedName,
                            valuation_status: 'pending',
                            total_marks_obtained: null,
                            percentage: null
                        });

                        console.log(`   ✅ Created submission ID: ${submission.submission_id}`);

                        // Prepare student answers
                        const answers = studentResult.recognition_result.answers;
                        const answersToCreate = [];

                        for (const [qLabel, answerText] of Object.entries(answers)) {
                            const qNum = parseInt(qLabel.replace('Q', ''));
                            answersToCreate.push({
                                submission_id: submission.submission_id,
                                question_number: qNum,
                                answer_text: answerText,
                                marks_obtained: null,
                                is_or_question: false,
                                or_option_chosen: null
                            });
                        }

                        await StudentAnswer.bulkCreate(answersToCreate);

                        console.log(`   ✅ Saved ${answersToCreate.length} answers to database`);
                        console.log(`✅ Database save complete for Student #${i + 1}`);
                    }

                } catch (dbError) {
                    console.error(`❌ Database Error for Student #${i + 1}:`);
                    console.error(`   Type: ${dbError.name}`);
                    console.error(`   Message: ${dbError.message}`);

                    if (dbError.name === 'SequelizeUniqueConstraintError') {
                        console.error(`   ⚠️  Duplicate entry: Roll number ${studentResult.student_info.roll_no} already exists`);
                    } else if (dbError.name === 'SequelizeForeignKeyConstraintError') {
                        console.error(`   ⚠️  Foreign key error: Exam or submission ID invalid`);
                    }

                    console.log(`   ⚠️  Student data available in results but not saved to database`);
                }
            } else {
                if (!exam_id) {
                    console.log(`⚠️  No exam_id provided - skipping database save`);
                } else if (!studentResult || studentResult.status !== 'Success') {
                    console.log(`⚠️  Processing failed - skipping database save`);
                }
            }

            // ============================================
            // STEP 3: ADD TO RESULTS
            // ============================================
            if (studentResult) {
                finalBatchResults.push(studentResult);
                console.log(`✅ Student #${i + 1} added to batch results`);
            }
        }

        // ============================================
        // BATCH PROCESSING COMPLETE
        // ============================================
        console.log(`\n${'='.repeat(70)}`);
        console.log(`📊 Batch Processing Complete`);
        console.log(`   Total students: ${studentCount}`);
        console.log(`   Successfully processed: ${finalBatchResults.filter(r => r.status === 'Success').length}`);
        console.log(`   Failed: ${finalBatchResults.filter(r => r.status === 'Failed').length}`);
        console.log('='.repeat(70) + '\n');

        // 🔍 DEBUG: Check for duplicates
        console.log('🔍 FINAL RESULTS ARRAY:');
        finalBatchResults.forEach((result, idx) => {
            if (result.status === 'Success') {
                console.log(`  [${idx}] Roll: ${result.student_info.roll_no} | Name: ${result.student_info.name}`);
            } else {
                console.log(`  [${idx}] FAILED | Roll: ${result.roll_no} | Error: ${result.error}`);
            }
        });

        // Check if there are actual duplicates in the array
        const rollNumbers = finalBatchResults
            .filter(r => r.status === 'Success')
            .map(r => r.student_info.roll_no);
        const uniqueRolls = [...new Set(rollNumbers)];

        if (rollNumbers.length !== uniqueRolls.length) {
            console.log('\n⚠️ WARNING: DUPLICATE ROLL NUMBERS DETECTED!');
            console.log(`   Total results: ${rollNumbers.length}`);
            console.log(`   Unique rolls: ${uniqueRolls.length}`);
            console.log(`   Duplicates: ${rollNumbers.filter((v, i, a) => a.indexOf(v) !== i)}`);
        } else {
            console.log('\n✅ No duplicates in finalBatchResults array');
        }
        console.log('='.repeat(70) + '\n');

        // Prepare exam info for results page
        let examInfo = null;
        if (exam_id && finalBatchResults.some(r => r.status === 'Success')) {
            examInfo = {
                exam_id: exam_id,
                exam_name: examData ? examData.exam_name : 'Unknown',
                student_count: finalBatchResults.filter(r => r.status === 'Success').length
            };
        }

        // Render results page (ONLY ONCE)
        res.render('results-batch', {
            title: 'Batch Evaluation Results',
            result: finalBatchResults,
            studentCount: finalBatchResults.length,
            examInfo: examInfo
        });

    } catch (error) {
        console.error("\n🔥 Critical Batch Error:", error.message);
        console.error("Stack trace:", error.stack);

        res.status(500).render('error', {
            message: `Batch Processing Failed: ${error.message}`
        });

    } finally {
        // ============================================
        // CLEANUP UPLOADED FILES
        // ============================================
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
        console.log(`📋 Loading exam data for: ${exam_id}`);

        // Load exam with all related data
        // req.exam is already set by requireExamOwner middleware
        const exam = await Exam.findOne({
            where: {
                exam_id: exam_id,
                user_id: req.user.user_id
            },
            include: [
                {
                    model: Question,
                    as: 'questions',
                    attributes: ['question_number', 'question_type', 'max_marks', 'teacher_answer']
                },
                {
                    model: OrGroup,
                    as: 'or_groups'
                },
                {
                    model: Submission,
                    as: 'submissions',
                    include: [
                        {
                            model: StudentAnswer,
                            as: 'answers'
                        }
                    ]
                }
            ]
        });

        if (!exam) {
            return res.status(404).render('error', {
                message: `Exam not found or access denied`
            });
        }

        // Format data for template (match old format)
        const examData = {
            exam_metadata: {
                exam_id: exam.exam_id,
                exam_name: exam.exam_name,
                class: exam.class,
                subject: exam.subject,
                total_marks: exam.total_marks
            },
            question_types: {},
            question_marks: {},
            teacher_answers: {},
            students: []
        };

        // Process questions
        exam.questions.forEach(q => {
            examData.question_types[q.question_number] = q.question_type;
            examData.question_marks[q.question_number] = q.max_marks;
            examData.teacher_answers[`Q${q.question_number}`] = q.teacher_answer;
        });

        // Process students
        exam.submissions.forEach(submission => {
            const studentAnswers = {};
            submission.answers.forEach(ans => {
                studentAnswers[`Q${ans.question_number}`] = ans.answer_text;
            });

            examData.students.push({
                roll_no: submission.roll_no,
                name: submission.student_name,
                valuation_status: submission.valuation_status,
                answers: studentAnswers
            });
        });

        console.log(`✅ Retrieved exam: ${exam.exam_name}`);
        console.log(`   📊 ${exam.submissions.length} student submissions`);

        res.render('valuation-prep', {
            title: `Valuation: ${exam.exam_name}`,
            examData: examData
        });

    } catch (error) {
        console.error('Error fetching exam data:', error.message);
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
        // Query database - only current user's exams
        const exams = await Exam.findAll({
            where: {
                user_id: req.user.user_id  // Filter by logged-in user
            },
            attributes: ['exam_id', 'exam_name', 'class', 'subject', 'total_marks'],
            order: [['created_at', 'DESC']]
        });

        // Format for frontend
        const answer_key_list = exams.map(exam => ({
            exam_id: exam.exam_id,
            exam_name: exam.exam_name,
            class: exam.class,
            subject: exam.subject
        }));

        console.log(`📋 Returning ${answer_key_list.length} answer keys for user ${req.user.username}`);

        res.json({
            status: 'Success',
            answer_keys: answer_key_list
        });

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

        // Load exam from PostgreSQL
        const exam = await Exam.findOne({
            where: {
                exam_id: exam_id,
                user_id: req.user.user_id
            },
            include: [
                { model: Question, as: 'questions' },
                { model: OrGroup, as: 'or_groups' },
                {
                    model: Submission,
                    as: 'submissions',
                    include: [{ model: StudentAnswer, as: 'answers' }]
                }
            ]
        });

        if (!exam) {
            return res.status(404).json({
                status: 'Failed',
                error: `Exam ${exam_id} not found or access denied`
            });
        }

        console.log(`✅ Loaded exam: ${exam.exam_name}`);
        console.log(`   📊 ${exam.submissions.length} students to evaluate`);

        // Format exam data for Python
        const examDataForPython = {
            exam_id: exam.exam_id,
            exam_name: exam.exam_name,
            exam_metadata: {
                exam_id: exam.exam_id,
                exam_name: exam.exam_name,
                class: exam.class,
                subject: exam.subject,
                total_marks: exam.total_marks
            },
            question_types: {},
            question_marks: {},
            teacher_answers: {},
            or_groups: [],
            student_submissions: {}
        };

        // Add questions
        exam.questions.forEach(q => {
            examDataForPython.question_types[q.question_number.toString()] = q.question_type;
            examDataForPython.question_marks[q.question_number.toString()] = q.max_marks;
            examDataForPython.teacher_answers[`Q${q.question_number}`] = q.teacher_answer;
        });

        // Add OR groups
        exam.or_groups.forEach(g => {
            examDataForPython.or_groups.push({
                type: g.group_type,
                options: JSON.parse(g.option_a),
                option_b: g.option_b ? JSON.parse(g.option_b) : []
            });
        });

        // Add student submissions
        exam.submissions.forEach(submission => {
            const answers = {};
            submission.answers.forEach(ans => {
                answers[`Q${ans.question_number}`] = ans.answer_text;
            });

            examDataForPython.student_submissions[submission.roll_no] = {
                student_info: {
                    name: submission.student_name,
                    roll_no: submission.roll_no
                },
                answers: answers
            };
        });

        console.log('📤 Sending complete exam data to Python for evaluation...');

        // Send to Python with complete exam data in request body
        const axios = require('axios');
        const PYTHON_BASE_URL = process.env.PYTHON_API_URL || "http://localhost:5000";

        const response = await axios.post(
            `${PYTHON_BASE_URL}/api/evaluate_exam_with_data`,  // ← NEW ENDPOINT
            examDataForPython,  // ← Send complete data
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 300000
            }
        );

        if (response.data.status === 'Success') {
            console.log(`✅ AI Valuation Completed Successfully`);
            console.log(`   📊 Total Students: ${response.data.total_students}`);
            console.log(`   ✅ Evaluated: ${response.data.evaluated_successfully}`);
            console.log(`   ❌ Failed: ${response.data.evaluation_failed}`);
            console.log(`${'='.repeat(50)}`);

            // Update database with results
            for (const result of response.data.results) {
                if (result.status === 'Success') {
                    await Submission.update(
                        {
                            valuation_status: 'completed',
                            total_marks_obtained: result.total_marks_obtained,
                            percentage: result.percentage
                        },
                        {
                            where: {
                                exam_id: exam_id,
                                roll_no: result.roll_no
                            }
                        }
                    );

                    // Update student answers with marks
                    for (const [qLabel, marks] of Object.entries(result.marks_breakdown)) {
                        const qNum = parseInt(qLabel.replace('Q', ''));
                        await StudentAnswer.update(
                            {
                                marks_obtained: marks.marks_obtained,
                                is_or_question: marks.or_group || false,
                                or_option_chosen: marks.chosen_option || null
                            },
                            {
                                where: {
                                    submission_id: (await Submission.findOne({
                                        where: { exam_id, roll_no: result.roll_no }
                                    })).submission_id,
                                    question_number: qNum
                                }
                            }
                        );
                    }
                }
            }

            console.log('✅ Database updated with evaluation results');

            res.json(response.data);
        } else {
            console.error(`❌ Valuation failed: ${response.data.error}`);
            res.status(400).json(response.data);
        }

    } catch (error) {
        console.error(`🔥 Critical Error during AI valuation:`, error.message);

        if (error.response) {
            console.error(`Python Response Error:`, error.response.data);
        }

        res.status(500).json({
            status: 'Failed',
            error: error.response?.data?.error || error.message
        });
    }
};