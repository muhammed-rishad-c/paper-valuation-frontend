const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const valuationService = require('../services/valuationService');
const { Exam, Question, OrGroup, Submission, StudentAnswer, User, sequelize } = require('../config/models');
const { Op } = require('sequelize');
const { generateExamId, parseQuestionRange, parseMarksString } = require('../utils/examHelpers');

const PYTHON_BASE_URL = process.env.PYTHON_API_URL || "http://localhost:5000";

// ============================================
// PAGE RENDERS
// ============================================

exports.getIndexPage = (req, res) => {
    res.render('index');
};

exports.getUploadPage = (req, res) => {
    res.render('individual', { title: 'Upload Paper' });
};

exports.getAnswerKeySetup = (req, res) => {
    res.render('answerKeySetup', {
        title: 'Answer Key Setup',
        sessionData: req.session?.answerKeyData || null
    });
};

exports.getSeriesBatch = (req, res) => {
    res.render('seriesBatch', { title: 'Series Batch Evaluation' });
};

exports.getHistory = (req, res) => {
    res.render('history', {
        title: 'History',
        user: req.user
    });
};

// ============================================
// USER PROFILE & SETTINGS
// ============================================

exports.getProfile = async (req, res) => {
    try {
        const userRecord = await User.findByPk(req.user.user_id, {
            attributes: ['user_id', 'username', 'email', 'full_name', 'role', 'created_at'],
            raw: true
        });

        if (!userRecord) {
            return res.status(401).render('error', { message: 'User not found' });
        }

        if (userRecord.created_at) {
            const date = new Date(userRecord.created_at);
            userRecord.created_at_formatted = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } else {
            userRecord.created_at_formatted = 'Not available';
        }

        res.render('profile', {
            title: 'Profile',
            user: userRecord
        });
    } catch (error) {
        console.error('Error loading profile:', error);
        res.status(500).render('error', { message: error.message });
    }
};

exports.postUpdateProfile = async (req, res) => {
    try {
        const { full_name, email } = req.body;
        const userId = req.user.user_id;

        if (!full_name || !email) {
            return res.status(400).json({
                status: 'Failed',
                error: 'Full name and email are required'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                status: 'Failed',
                error: 'Invalid email format'
            });
        }

        const allUsers = await User.findAll({ where: { email } });
        const existingUser = allUsers.find(u => u.user_id !== userId);

        if (existingUser) {
            return res.status(400).json({
                status: 'Failed',
                error: 'Email is already taken by another user'
            });
        }

        await User.update(
            { full_name, email },
            { where: { user_id: userId } }
        );

        req.user.full_name = full_name;
        req.user.email = email;

        res.json({
            status: 'Success',
            message: 'Profile updated successfully'
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({
            status: 'Failed',
            error: error.message
        });
    }
};

exports.postChangePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.user_id;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                status: 'Failed',
                error: 'Current password and new password are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                status: 'Failed',
                error: 'New password must be at least 6 characters'
            });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({
                status: 'Failed',
                error: 'User not found'
            });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({
                status: 'Failed',
                error: 'Current password is incorrect'
            });
        }

        const salt = await bcrypt.genSalt(10);
        const newPasswordHash = await bcrypt.hash(newPassword, salt);

        await User.update(
            { password_hash: newPasswordHash },
            { where: { user_id: userId } }
        );

        res.json({
            status: 'Success',
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({
            status: 'Failed',
            error: error.message
        });
    }
};

// ============================================
// DASHBOARD & STATISTICS
// ============================================

exports.getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.user_id;

        const totalExams = await Exam.count({ where: { user_id: userId } });

        let totalStudents = 0;
        try {
            totalStudents = await Submission.count({
                include: [{
                    model: Exam,
                    as: 'exam',
                    where: { user_id: userId },
                    attributes: []
                }]
            });
        } catch (err) {
            console.error('Error counting students:', err.message);
        }

        let completedEvaluations = 0;
        try {
            completedEvaluations = await Submission.count({
                where: { valuation_status: 'completed' },
                include: [{
                    model: Exam,
                    as: 'exam',
                    where: { user_id: userId },
                    attributes: []
                }]
            });
        } catch (err) {
            console.error('Error counting completed:', err.message);
        }

        let avgPercentage = 0;
        try {
            const completedSubmissions = await Submission.findAll({
                where: { valuation_status: 'completed' },
                include: [{
                    model: Exam,
                    as: 'exam',
                    where: { user_id: userId },
                    attributes: []
                }],
                attributes: ['percentage']
            });

            const validPercentages = completedSubmissions
                .map(s => parseFloat(s.percentage))
                .filter(p => !isNaN(p) && p !== null);

            if (validPercentages.length > 0) {
                avgPercentage = validPercentages.reduce((a, b) => a + b, 0) / validPercentages.length;
            }
        } catch (err) {
            console.error('Error calculating average:', err.message);
        }

        let recentActivity = [];
        try {
            const recentSubmissions = await Submission.findAll({
                include: [{
                    model: Exam,
                    as: 'exam',
                    where: { user_id: userId },
                    attributes: ['exam_name', 'class', 'subject']
                }],
                attributes: ['submission_id', 'roll_no', 'student_name', 'valuation_status', 'percentage', 'created_at'],
                order: [['created_at', 'DESC']],
                limit: 10,
                raw: true,
                nest: true
            });

            recentActivity = recentSubmissions.map(sub => {
                const status = sub.valuation_status === 'completed' ? '✅' : '⏳';
                const scoreText = sub.percentage ? ` - ${parseFloat(sub.percentage).toFixed(1)}%` : '';

                let dateStr = 'Unknown date';
                if (sub.created_at) {
                    try {
                        const date = new Date(sub.created_at);
                        if (!isNaN(date.getTime())) {
                            dateStr = date.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                            });
                        }
                    } catch (e) {
                        console.error('Date error:', e);
                    }
                }

                return {
                    title: `${status} ${sub.exam.exam_name}`,
                    details: `Student: ${sub.student_name || 'Unknown'} (Roll ${sub.roll_no})${scoreText}`,
                    date: dateStr
                };
            });
        } catch (err) {
            console.error('Error loading recent activity:', err.message);
        }

        res.json({
            status: 'Success',
            stats: {
                total_exams: totalExams,
                total_students: totalStudents,
                completed_evaluations: completedEvaluations,
                avg_percentage: parseFloat(avgPercentage.toFixed(2))
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

exports.getHistoryData = async (req, res) => {
    try {
        const userId = req.user.user_id;

        const examsWithStats = await sequelize.query(`
            SELECT 
                e.exam_id,
                e.exam_name,
                e.class,
                e.subject,
                e.total_marks,
                e.created_at,
                COUNT(s.submission_id) as submissions_count,
                COUNT(CASE WHEN s.valuation_status = 'completed' THEN 1 END) as completed_count,
                ROUND(AVG(CASE WHEN s.valuation_status = 'completed' THEN CAST(s.percentage AS DECIMAL) END), 2) as avg_percentage
            FROM exams e
            LEFT JOIN submissions s ON e.exam_id = s.exam_id
            WHERE e.user_id = :userId
            GROUP BY e.exam_id, e.exam_name, e.class, e.subject, e.total_marks, e.created_at
            ORDER BY e.created_at DESC
        `, {
            replacements: { userId },
            type: sequelize.QueryTypes.SELECT
        });

        const formattedExams = examsWithStats.map(exam => ({
            exam_id: exam.exam_id,
            exam_name: exam.exam_name,
            class: exam.class,
            subject: exam.subject,
            total_marks: exam.total_marks,
            created_at: exam.created_at,
            submissions_count: parseInt(exam.submissions_count) || 0,
            completed_count: parseInt(exam.completed_count) || 0,
            avg_percentage: parseFloat(exam.avg_percentage) || 0
        }));

        res.json({
            status: 'Success',
            exams: formattedExams
        });
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({
            status: 'Failed',
            error: error.message
        });
    }
};

// ============================================
// PDF EXPORT
// ============================================

exports.exportPDF = async (req, res) => {
    try {
        const exam_id = req.params.exam_id;
        const userId = req.user.user_id;

        const exam = await Exam.findOne({
            where: { exam_id, user_id: userId },
            include: [
                { model: Question, as: 'questions' },
                {
                    model: Submission,
                    as: 'submissions',
                    where: { valuation_status: 'completed' },
                    required: false,
                    include: [{ model: StudentAnswer, as: 'answers' }]
                }
            ]
        });

        if (!exam) {
            return res.status(404).json({ error: 'Exam not found' });
        }

        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=exam_results_${exam_id}.pdf`);

        doc.pipe(res);

        // Title
        doc.fontSize(20).font('Helvetica-Bold').text('Exam Results Report', { align: 'center' });
        doc.moveDown();

        // Exam Info
        doc.fontSize(12).font('Helvetica-Bold').text('Exam Information');
        doc.fontSize(10).font('Helvetica')
            .text(`Exam: ${exam.exam_name}`)
            .text(`Class: ${exam.class} | Subject: ${exam.subject}`)
            .text(`Total Marks: ${exam.total_marks}`)
            .text(`Date: ${new Date().toLocaleDateString()}`);
        doc.moveDown();

        // Summary Statistics
        const totalStudents = exam.submissions.length;
        const avgMarks = totalStudents > 0
            ? exam.submissions.reduce((sum, s) => sum + (parseFloat(s.total_marks_obtained) || 0), 0) / totalStudents
            : 0;
        const avgPercentage = totalStudents > 0
            ? exam.submissions.reduce((sum, s) => sum + (parseFloat(s.percentage) || 0), 0) / totalStudents
            : 0;
        const passCount = exam.submissions.filter(s => (parseFloat(s.percentage) || 0) >= 40).length;

        doc.fontSize(12).font('Helvetica-Bold').text('Summary');
        doc.fontSize(10).font('Helvetica')
            .text(`Total Students: ${totalStudents}`)
            .text(`Average Marks: ${avgMarks.toFixed(2)}/${exam.total_marks}`)
            .text(`Average Percentage: ${avgPercentage.toFixed(2)}%`)
            .text(`Pass Rate: ${totalStudents > 0 ? ((passCount / totalStudents) * 100).toFixed(1) : 0}% (${passCount}/${totalStudents})`);
        doc.moveDown();

        // Student Results Table
        doc.fontSize(12).font('Helvetica-Bold').text('Student Results');
        doc.moveDown(0.5);

        const tableTop = doc.y;
        const colWidths = { rank: 40, roll: 60, name: 150, marks: 80, percentage: 80, result: 60 };
        let xPos = 50;

        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('Rank', xPos, tableTop, { width: colWidths.rank });
        xPos += colWidths.rank;
        doc.text('Roll No', xPos, tableTop, { width: colWidths.roll });
        xPos += colWidths.roll;
        doc.text('Name', xPos, tableTop, { width: colWidths.name });
        xPos += colWidths.name;
        doc.text('Marks', xPos, tableTop, { width: colWidths.marks });
        xPos += colWidths.marks;
        doc.text('Percentage', xPos, tableTop, { width: colWidths.percentage });
        xPos += colWidths.percentage;
        doc.text('Result', xPos, tableTop, { width: colWidths.result });

        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
        doc.moveDown();

        const sortedStudents = [...exam.submissions].sort((a, b) =>
            (parseFloat(b.total_marks_obtained) || 0) - (parseFloat(a.total_marks_obtained) || 0)
        );

        doc.font('Helvetica');
        sortedStudents.forEach((student, idx) => {
            if (doc.y > 700) {
                doc.addPage();
                doc.y = 50;
            }

            xPos = 50;
            const yPos = doc.y;

            doc.text(idx + 1, xPos, yPos, { width: colWidths.rank });
            xPos += colWidths.rank;
            doc.text(student.roll_no, xPos, yPos, { width: colWidths.roll });
            xPos += colWidths.roll;
            doc.text(student.student_name || 'Unknown', xPos, yPos, { width: colWidths.name });
            xPos += colWidths.name;
            doc.text(`${parseFloat(student.total_marks_obtained) || 0}/${exam.total_marks}`, xPos, yPos, { width: colWidths.marks });
            xPos += colWidths.marks;
            doc.text(`${(parseFloat(student.percentage) || 0).toFixed(1)}%`, xPos, yPos, { width: colWidths.percentage });
            xPos += colWidths.percentage;
            doc.text((parseFloat(student.percentage) || 0) >= 40 ? 'Pass' : 'Fail', xPos, yPos, { width: colWidths.result });

            doc.moveDown();
        });

        doc.fontSize(8).font('Helvetica').text(
            `Generated on ${new Date().toLocaleString()} | Paper Valuation System`,
            50,
            doc.page.height - 50,
            { align: 'center' }
        );

        doc.end();
    } catch (error) {
        console.error('PDF export error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// EXCEL EXPORT
// ============================================

exports.exportExcel = async (req, res) => {
    try {
        const exam_id = req.params.exam_id;
        const userId = req.user.user_id;

        const exam = await Exam.findOne({
            where: { exam_id, user_id: userId },
            include: [
                { model: Question, as: 'questions' },
                {
                    model: Submission,
                    as: 'submissions',
                    where: { valuation_status: 'completed' },
                    required: false,
                    include: [{ model: StudentAnswer, as: 'answers' }]
                }
            ]
        });

        if (!exam) {
            return res.status(404).json({ error: 'Exam not found' });
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Paper Valuation System';
        workbook.created = new Date();

        // Summary Sheet
        const summarySheet = workbook.addWorksheet('Summary');
        summarySheet.columns = [
            { header: 'Information', key: 'label', width: 25 },
            { header: 'Value', key: 'value', width: 40 }
        ];

        summarySheet.addRows([
            { label: 'Exam Name', value: exam.exam_name },
            { label: 'Class', value: exam.class },
            { label: 'Subject', value: exam.subject },
            { label: 'Total Marks', value: exam.total_marks },
            { label: 'Total Students', value: exam.submissions.length },
            { label: '', value: '' },
            { label: 'Statistics', value: '' },
        ]);

        const totalStudents = exam.submissions.length;
        const avgMarks = totalStudents > 0
            ? exam.submissions.reduce((sum, s) => sum + (parseFloat(s.total_marks_obtained) || 0), 0) / totalStudents
            : 0;
        const avgPercentage = totalStudents > 0
            ? exam.submissions.reduce((sum, s) => sum + (parseFloat(s.percentage) || 0), 0) / totalStudents
            : 0;
        const passCount = exam.submissions.filter(s => (parseFloat(s.percentage) || 0) >= 40).length;
        const passRate = totalStudents > 0 ? (passCount / totalStudents) * 100 : 0;

        summarySheet.addRows([
            { label: 'Average Marks', value: `${avgMarks.toFixed(2)}/${exam.total_marks}` },
            { label: 'Average Percentage', value: `${avgPercentage.toFixed(2)}%` },
            { label: 'Pass Count', value: `${passCount}/${totalStudents}` },
            { label: 'Pass Rate', value: `${passRate.toFixed(1)}%` }
        ]);

        summarySheet.getRow(1).font = { bold: true };
        summarySheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF667eea' }
        };

        // Results Sheet
        const resultsSheet = workbook.addWorksheet('Student Results');
        resultsSheet.columns = [
            { header: 'Rank', key: 'rank', width: 8 },
            { header: 'Roll No', key: 'roll_no', width: 12 },
            { header: 'Student Name', key: 'name', width: 25 },
            { header: 'Marks Obtained', key: 'marks', width: 15 },
            { header: 'Total Marks', key: 'total', width: 12 },
            { header: 'Percentage', key: 'percentage', width: 12 },
            { header: 'Result', key: 'result', width: 10 }
        ];

        const sortedStudents = [...exam.submissions].sort((a, b) =>
            (parseFloat(b.total_marks_obtained) || 0) - (parseFloat(a.total_marks_obtained) || 0)
        );

        sortedStudents.forEach((student, idx) => {
            resultsSheet.addRow({
                rank: idx + 1,
                roll_no: student.roll_no,
                name: student.student_name || 'Unknown',
                marks: parseFloat(student.total_marks_obtained) || 0,
                total: exam.total_marks,
                percentage: `${(parseFloat(student.percentage) || 0).toFixed(1)}%`,
                result: (parseFloat(student.percentage) || 0) >= 40 ? 'Pass' : 'Fail'
            });
        });

        resultsSheet.getRow(1).font = { bold: true };
        resultsSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF667eea' }
        };

        // Detailed Results Sheet
        const detailedSheet = workbook.addWorksheet('Detailed Results');
        const detailedColumns = [
            { header: 'Roll No', key: 'roll_no', width: 12 },
            { header: 'Student Name', key: 'name', width: 25 }
        ];

        exam.questions.forEach(q => {
            detailedColumns.push({
                header: `Q${q.question_number} (${q.max_marks}m)`,
                key: `q${q.question_number}`,
                width: 12
            });
        });

        detailedColumns.push(
            { header: 'Total', key: 'total', width: 10 },
            { header: 'Percentage', key: 'percentage', width: 12 }
        );

        detailedSheet.columns = detailedColumns;

        sortedStudents.forEach(student => {
            const row = {
                roll_no: student.roll_no,
                name: student.student_name || 'Unknown',
                total: parseFloat(student.total_marks_obtained) || 0,
                percentage: `${(parseFloat(student.percentage) || 0).toFixed(1)}%`
            };

            student.answers.forEach(answer => {
                row[`q${answer.question_number}`] = parseFloat(answer.marks_obtained) || 0;
            });

            detailedSheet.addRow(row);
        });

        detailedSheet.getRow(1).font = { bold: true };
        detailedSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF667eea' }
        };

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename=exam_results_${exam_id}.xlsx`
        );

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Excel export error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// ANSWER KEY MANAGEMENT
// ============================================

exports.postExtractAnswerKey = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            status: 'Failed',
            error: 'No image file provided.'
        });
    }

    const answerType = req.body.answer_type || 'short';
    const formData = new FormData();

    try {
        formData.append('answer_key_image', fs.createReadStream(req.file.path), {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });
        formData.append('answer_type', answerType);

        const resultData = await valuationService.sendToPythonAPI(
            formData,
            '/api/extract_answer_key_text',
            { headers: { ...formData.getHeaders() } }
        );

        res.json({
            status: 'Success',
            answers: resultData.answers,
            metadata: resultData.metadata
        });
    } catch (error) {
        console.error('Error extracting answer key:', error.message);
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

        if (!exam_name || !class_name || !subject) {
            return res.status(400).json({
                status: 'Failed',
                error: 'Missing required fields: exam_name, class_name, or subject'
            });
        }

        const shortQuestions = short_questions ? parseQuestionRange(short_questions) : [];
        const longQuestions = long_questions ? parseQuestionRange(long_questions) : [];

        if (shortQuestions.length === 0 && longQuestions.length === 0) {
            return res.status(400).json({
                status: 'Failed',
                error: 'Please specify at least one question range'
            });
        }

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

        const exam_id = generateExamId(exam_name, class_name, subject);

        await sequelize.transaction(async (transaction) => {
            await Exam.create({
                exam_id,
                user_id: req.user.user_id,
                exam_name,
                class: class_name,
                subject,
                total_marks: totalMarks
            }, { transaction });

            const questionsToCreate = [];

            for (let i = 0; i < shortQuestions.length; i++) {
                const qNum = shortQuestions[i];
                const qLabel = `Q${qNum}`;
                questionsToCreate.push({
                    exam_id,
                    question_number: qNum,
                    question_type: 'short',
                    max_marks: shortMarksList[i],
                    teacher_answer: short_answers[qLabel] || ''
                });
            }

            for (let i = 0; i < longQuestions.length; i++) {
                const qNum = longQuestions[i];
                const qLabel = `Q${qNum}`;
                questionsToCreate.push({
                    exam_id,
                    question_number: qNum,
                    question_type: 'long',
                    max_marks: longMarksList[i],
                    teacher_answer: long_answers[qLabel] || ''
                });
            }

            await Question.bulkCreate(questionsToCreate, { transaction });

            if (or_groups && or_groups.length > 0) {
                const orGroupsToCreate = or_groups.map(group => ({
                    exam_id,
                    group_type: group.type,
                    option_a: JSON.stringify(group.options || group.option_a || []),
                    option_b: JSON.stringify(group.option_b || [])
                }));

                await OrGroup.bulkCreate(orGroupsToCreate, { transaction });
            }
        });

        res.json({
            status: 'Success',
            exam_id,
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

exports.getAnswerKeysList = async (req, res) => {
    try {
        const exams = await Exam.findAll({
            where: { user_id: req.user.user_id },
            attributes: ['exam_id', 'exam_name', 'class', 'subject', 'total_marks'],
            order: [['created_at', 'DESC']]
        });

        const answer_key_list = exams.map(exam => ({
            exam_id: exam.exam_id,
            exam_name: exam.exam_name,
            class: exam.class,
            subject: exam.subject
        }));

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
// INDIVIDUAL EVALUATION
// ============================================

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

    try {
        const exam = await Exam.findOne({
            where: { exam_id, user_id: req.user.user_id },
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

        exam.questions.forEach(q => {
            examData.question_types[q.question_number.toString()] = q.question_type;
            examData.question_marks[q.question_number.toString()] = q.max_marks;
            examData.teacher_answers[`Q${q.question_number}`] = q.teacher_answer;
        });

        exam.or_groups.forEach(g => {
            examData.or_groups.push({
                type: g.group_type,
                options: JSON.parse(g.option_a),
                option_b: g.option_b ? JSON.parse(g.option_b) : []
            });
        });

        const formData = new FormData();
        formData.append('exam_data', JSON.stringify(examData));

        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            formData.append('paper_images', fs.createReadStream(file.path), {
                filename: file.originalname,
                contentType: file.mimetype
            });
        }

        const resultData = await valuationService.sendToPythonAPI(
            formData,
            '/api/evaluate_individual_with_data',
            {
                headers: { ...formData.getHeaders() },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        res.render('results', {
            title: 'Evaluation Results',
            result: resultData,
            isIndividual: true
        });
    } catch (error) {
        console.error('Error in postEvaluate:', error.message);
        const errorMessage = error.response?.data?.error || 'Failed to connect to the evaluation service.';
        res.status(500).render('error', {
            message: `System Error: ${errorMessage}`
        });
    } finally {
        if (req.files) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlink(file.path, (err) => {
                        if (err) console.error('Cleanup error:', err);
                    });
                }
            });
        }
    }
};

// ============================================
// BATCH EVALUATION
// ============================================

exports.postEvaluateSeriesBatch = async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).render('error', { message: 'No images uploaded.' });
    }

    const finalBatchResults = [];
    const studentCount = parseInt(req.body.student_count) || 0;

    try {
        const exam_id = req.body.exam_id || null;
        const global_class = req.body.global_class;
        const global_subject = req.body.global_subject;

        let examData = null;
        
        if (exam_id) {
            const exam = await Exam.findOne({
                where: { exam_id, user_id: req.user.user_id },
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

            examData = {
                exam_id: exam.exam_id,
                exam_name: exam.exam_name,
                question_types: {},
                question_marks: {},
                teacher_answers: {},
                or_groups: []
            };

            exam.questions.forEach(q => {
                examData.question_types[q.question_number.toString()] = q.question_type;
                examData.question_marks[q.question_number.toString()] = q.max_marks;
                examData.teacher_answers[`Q${q.question_number}`] = q.teacher_answer;
            });

            exam.or_groups.forEach(g => {
                examData.or_groups.push({
                    type: g.group_type,
                    options: JSON.parse(g.option_a),
                    option_b: g.option_b ? JSON.parse(g.option_b) : []
                });
            });
        }

        for (let i = 0; i < studentCount; i++) {
            const studentKey = `student_${i}`;
            const roll_no = req.body[`roll_no_${i}`] || '';
            const studentFiles = req.files.filter(f => f.fieldname === studentKey);

            if (studentFiles.length === 0) continue;

            const formData = new FormData();
            formData.append('manual_roll_no', roll_no);
            formData.append('manual_class', global_class);
            formData.append('manual_subject', global_subject);

            if (examData) {
                formData.append('exam_data', JSON.stringify(examData));
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

            let studentResult = null;

            try {
                studentResult = await valuationService.sendToPythonAPI(
                    formData,
                    '/api/seriesBundleEvaluate',
                    {
                        headers: { ...formData.getHeaders() },
                        timeout: 120000
                    }
                );
            } catch (apiError) {
                console.error(`Error processing Student #${i + 1}:`, apiError.message);
                finalBatchResults.push({
                    status: 'Failed',
                    student_index: i + 1,
                    roll_no: roll_no || 'Unknown',
                    error: `OCR Processing Failed: ${apiError.message}`
                });
                continue;
            }

            if (studentResult && studentResult.status === 'Success' && exam_id) {
                try {
                    const extractedRollNo = studentResult.student_info.roll_no;
                    const extractedName = studentResult.student_info.name || 'Unknown';

                    const existingSubmission = await Submission.findOne({
                        where: { exam_id, roll_no: extractedRollNo }
                    });

                    if (!existingSubmission) {
                        const submission = await Submission.create({
                            exam_id,
                            roll_no: extractedRollNo,
                            student_name: extractedName,
                            valuation_status: 'pending',
                            total_marks_obtained: null,
                            percentage: null
                        });

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
                    }
                } catch (dbError) {
                    console.error(`Database error for Student #${i + 1}:`, dbError.message);
                }
            }

            if (studentResult) {
                finalBatchResults.push(studentResult);
            }
        }

        let examInfo = null;
        if (exam_id && finalBatchResults.some(r => r.status === 'Success')) {
            examInfo = {
                exam_id,
                exam_name: examData ? examData.exam_name : 'Unknown',
                student_count: finalBatchResults.filter(r => r.status === 'Success').length
            };
        }

        res.render('results-batch', {
            title: 'Batch Evaluation Results',
            result: finalBatchResults,
            studentCount: finalBatchResults.length,
            examInfo
        });
    } catch (error) {
        console.error('Batch Processing Error:', error.message);
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
        }
    }
};

// ============================================
// VALUATION PREPARATION & AI EVALUATION
// ============================================

exports.getValuationPrep = async (req, res) => {
    const exam_id = req.params.exam_id;

    try {
        const exam = await Exam.findOne({
            where: { exam_id, user_id: req.user.user_id },
            include: [
                {
                    model: Question,
                    as: 'questions',
                    attributes: ['question_number', 'question_type', 'max_marks', 'teacher_answer']
                },
                { model: OrGroup, as: 'or_groups' },
                {
                    model: Submission,
                    as: 'submissions',
                    include: [{ model: StudentAnswer, as: 'answers' }]
                }
            ]
        });

        if (!exam) {
            return res.status(404).render('error', {
                message: 'Exam not found or access denied'
            });
        }

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

        exam.questions.forEach(q => {
            examData.question_types[q.question_number] = q.question_type;
            examData.question_marks[q.question_number] = q.max_marks;
            examData.teacher_answers[`Q${q.question_number}`] = q.teacher_answer;
        });

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

        res.render('valuation-prep', {
            title: `Valuation: ${exam.exam_name}`,
            examData
        });
    } catch (error) {
        console.error('Error fetching exam data:', error.message);
        res.status(500).render('error', {
            message: `Failed to load exam data: ${error.message}`
        });
    }
};

exports.postEvaluateExam = async (req, res) => {
    const exam_id = req.params.exam_id;

    try {
        const exam = await Exam.findOne({
            where: { exam_id, user_id: req.user.user_id },
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

        exam.questions.forEach(q => {
            examDataForPython.question_types[q.question_number.toString()] = q.question_type;
            examDataForPython.question_marks[q.question_number.toString()] = q.max_marks;
            examDataForPython.teacher_answers[`Q${q.question_number}`] = q.teacher_answer;
        });

        exam.or_groups.forEach(g => {
            examDataForPython.or_groups.push({
                type: g.group_type,
                options: JSON.parse(g.option_a),
                option_b: g.option_b ? JSON.parse(g.option_b) : []
            });
        });

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
                answers
            };
        });

        const response = await axios.post(
            `${PYTHON_BASE_URL}/api/evaluate_exam_with_data`,
            examDataForPython,
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 300000
            }
        );

        if (response.data.status === 'Success') {
            for (const result of response.data.results) {
                if (result.status === 'Success') {
                    await Submission.update(
                        {
                            valuation_status: 'completed',
                            total_marks_obtained: result.total_marks_obtained,
                            percentage: result.percentage
                        },
                        {
                            where: { exam_id, roll_no: result.roll_no }
                        }
                    );

                    for (const [qLabel, marks] of Object.entries(result.marks_breakdown)) {
                        const qNum = parseInt(qLabel.replace('Q', ''));
                        const submission = await Submission.findOne({
                            where: { exam_id, roll_no: result.roll_no }
                        });

                        await StudentAnswer.update(
                            {
                                marks_obtained: marks.marks_obtained,
                                is_or_question: marks.or_group || false,
                                or_option_chosen: marks.chosen_option || null
                            },
                            {
                                where: {
                                    submission_id: submission.submission_id,
                                    question_number: qNum
                                }
                            }
                        );
                    }
                }
            }

            res.json(response.data);
        } else {
            console.error('Valuation failed:', response.data.error);
            res.status(400).json(response.data);
        }
    } catch (error) {
        console.error('Error during AI valuation:', error.message);
        res.status(500).json({
            status: 'Failed',
            error: error.response?.data?.error || error.message
        });
    }
};