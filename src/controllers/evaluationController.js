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

function calculateActualTotalMarks(exam) {
    if (!exam.questions || exam.questions.length === 0) {
        return exam.total_marks || 0;
    }

    if (!exam.or_groups || exam.or_groups.length === 0) {
        return exam.questions.reduce((sum, q) => sum + (q.max_marks || 0), 0);
    }

    const orGroupQuestions = new Set();
    const orGroupMaxMarks = {};

    exam.or_groups.forEach(group => {
        let options = [];
        let optionA = [];
        let optionB = [];

        if (group.group_type === 'single') {
            try {
                options = typeof group.option_a === 'string'
                    ? JSON.parse(group.option_a)
                    : group.option_a;

                options = options.map(q => parseInt(q));

            } catch (e) {
                console.error('Error parsing OR group options:', e);
                return;
            }

            if (options.length === 2) {
                const q1 = options[0];
                const q2 = options[1];

                orGroupQuestions.add(q1);
                orGroupQuestions.add(q2);

                const q1Marks = exam.questions.find(q => q.question_number === q1)?.max_marks || 0;
                const q2Marks = exam.questions.find(q => q.question_number === q2)?.max_marks || 0;

                const groupKey = `${Math.min(q1, q2)}-${Math.max(q1, q2)}`;
                orGroupMaxMarks[groupKey] = Math.max(q1Marks, q2Marks);
            }

        } else if (group.group_type === 'pair') {
            try {
                optionA = typeof group.option_a === 'string'
                    ? JSON.parse(group.option_a)
                    : group.option_a;
                optionB = typeof group.option_b === 'string'
                    ? JSON.parse(group.option_b)
                    : group.option_b;

                optionA = optionA.map(q => parseInt(q));
                optionB = optionB.map(q => parseInt(q));

            } catch (e) {
                console.error('Error parsing OR group options:', e);
                return;
            }

            optionA.forEach(q => orGroupQuestions.add(q));
            optionB.forEach(q => orGroupQuestions.add(q));

            // Calculate total marks for option A
            const optionAMarks = optionA.reduce((sum, qNum) => {
                const q = exam.questions.find(q => q.question_number === qNum);
                return sum + (q?.max_marks || 0);
            }, 0);


            const optionBMarks = optionB.reduce((sum, qNum) => {
                const q = exam.questions.find(q => q.question_number === qNum);
                return sum + (q?.max_marks || 0);
            }, 0);


            const groupKey = `pair-${optionA.join(',')}-${optionB.join(',')}`;
            orGroupMaxMarks[groupKey] = Math.max(optionAMarks, optionBMarks);
        }
    });


    let totalMarks = 0;
    const processedOrGroups = new Set();

    exam.questions.forEach(question => {
        const qNum = question.question_number;

        if (orGroupQuestions.has(qNum)) {

            let groupKey = null;

            exam.or_groups.forEach(group => {
                if (group.group_type === 'single') {
                    let options = typeof group.option_a === 'string'
                        ? JSON.parse(group.option_a)
                        : group.option_a;
                    options = options.map(q => parseInt(q));

                    if (options.includes(qNum)) {
                        groupKey = `${Math.min(...options)}-${Math.max(...options)}`;
                    }
                } else if (group.group_type === 'pair') {
                    let optionA = typeof group.option_a === 'string'
                        ? JSON.parse(group.option_a)
                        : group.option_a;
                    let optionB = typeof group.option_b === 'string'
                        ? JSON.parse(group.option_b)
                        : group.option_b;

                    optionA = optionA.map(q => parseInt(q));
                    optionB = optionB.map(q => parseInt(q));

                    if (optionA.includes(qNum) || optionB.includes(qNum)) {
                        groupKey = `pair-${optionA.join(',')}-${optionB.join(',')}`;
                    }
                }
            });


            if (groupKey && !processedOrGroups.has(groupKey)) {
                totalMarks += orGroupMaxMarks[groupKey] || 0;
                processedOrGroups.add(groupKey);
            }

        } else {

            totalMarks += question.max_marks || 0;
        }
    });

    return totalMarks;
}


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
                { model: OrGroup, as: 'or_groups' },
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


        console.log('calculateActualTotalMarks exists?', typeof calculateActualTotalMarks);

        const actualTotalMarks = calculateActualTotalMarks(exam);



        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=exam_results_${exam_id}.pdf`);

        doc.pipe(res);


        doc.fontSize(20).font('Helvetica-Bold').text('Exam Results Report', { align: 'center' });
        doc.moveDown();


        doc.fontSize(12).font('Helvetica-Bold').text('Exam Information');
        doc.fontSize(10).font('Helvetica')
            .text(`Exam: ${exam.exam_name}`)
            .text(`Class: ${exam.class} | Subject: ${exam.subject}`)
            .text(`Total Marks: ${actualTotalMarks}`)
            .text(`Date: ${new Date().toLocaleDateString()}`);
        doc.moveDown();


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
            .text(`Average Marks: ${avgMarks.toFixed(2)}/${actualTotalMarks}`)
            .text(`Average Percentage: ${avgPercentage.toFixed(2)}%`)
            .text(`Pass Rate: ${totalStudents > 0 ? ((passCount / totalStudents) * 100).toFixed(1) : 0}% (${passCount}/${totalStudents})`);
        doc.moveDown();


        doc.fontSize(12).font('Helvetica-Bold').text('Student Results');
        doc.moveDown(0.5);

        const tableTop = doc.y;
        const colWidths = {
            rank: 40,
            roll: 60,
            name: 150,
            marks: 80,
            percentage: 80,
            result: 60
        };
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
            doc.text(`${parseFloat(student.total_marks_obtained) || 0}/${actualTotalMarks}`, xPos, yPos, { width: colWidths.marks });
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
                { model: OrGroup, as: 'or_groups' },
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

        const actualTotalMarks = calculateActualTotalMarks(exam);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Paper Valuation System';
        workbook.created = new Date();

        const summarySheet = workbook.addWorksheet('Summary');
        summarySheet.columns = [
            { header: 'Information', key: 'label', width: 25 },
            { header: 'Value', key: 'value', width: 40 }
        ];

        summarySheet.addRows([
            { label: 'Exam Name', value: exam.exam_name },
            { label: 'Class', value: exam.class },
            { label: 'Subject', value: exam.subject },
            { label: 'Total Marks', value: actualTotalMarks },
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
            { label: 'Average Marks', value: `${avgMarks.toFixed(2)}/${actualTotalMarks}` },
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
                total: actualTotalMarks,
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

        if (shortQuestions.length > 0) {
            if (!short_marks) {
                return res.status(400).json({
                    status: 'Failed',
                    error: 'Short questions specified but no marks provided'
                });
            }
            shortMarksList = parseMarksString(short_marks, shortQuestions.length);
        }

        if (longQuestions.length > 0) {
            if (!long_marks) {
                return res.status(400).json({
                    status: 'Failed',
                    error: 'Long questions specified but no marks provided'
                });
            }
            longMarksList = parseMarksString(long_marks, longQuestions.length);
        }

        // ============================================
        // CALCULATE ACTUAL TOTAL MARKS (WITH OR GROUPS)
        // ============================================
        let totalMarks = 0;
        const orGroupQuestions = new Set();
        const orGroupMaxMarks = {};

        // Process OR groups to identify which questions are in groups
        if (or_groups && or_groups.length > 0) {
            or_groups.forEach(group => {
                if (group.type === 'single' && group.options && group.options.length === 2) {
                    const q1 = group.options[0];
                    const q2 = group.options[1];

                    orGroupQuestions.add(q1);
                    orGroupQuestions.add(q2);

                    // Find marks for both questions
                    let q1Marks = 0;
                    let q2Marks = 0;

                    const q1IndexShort = shortQuestions.indexOf(q1);
                    const q2IndexShort = shortQuestions.indexOf(q2);
                    const q1IndexLong = longQuestions.indexOf(q1);
                    const q2IndexLong = longQuestions.indexOf(q2);

                    if (q1IndexShort !== -1) q1Marks = shortMarksList[q1IndexShort];
                    else if (q1IndexLong !== -1) q1Marks = longMarksList[q1IndexLong];

                    if (q2IndexShort !== -1) q2Marks = shortMarksList[q2IndexShort];
                    else if (q2IndexLong !== -1) q2Marks = longMarksList[q2IndexLong];

                    const groupKey = `${Math.min(q1, q2)}-${Math.max(q1, q2)}`;
                    orGroupMaxMarks[groupKey] = Math.max(q1Marks, q2Marks);

                } else if (group.type === 'pair' && group.option_a && group.option_b) {
                    group.option_a.forEach(q => orGroupQuestions.add(q));
                    group.option_b.forEach(q => orGroupQuestions.add(q));

                    let optionAMarks = 0;
                    let optionBMarks = 0;

                    group.option_a.forEach(qNum => {
                        const idxShort = shortQuestions.indexOf(qNum);
                        const idxLong = longQuestions.indexOf(qNum);
                        if (idxShort !== -1) optionAMarks += shortMarksList[idxShort];
                        else if (idxLong !== -1) optionAMarks += longMarksList[idxLong];
                    });

                    group.option_b.forEach(qNum => {
                        const idxShort = shortQuestions.indexOf(qNum);
                        const idxLong = longQuestions.indexOf(qNum);
                        if (idxShort !== -1) optionBMarks += shortMarksList[idxShort];
                        else if (idxLong !== -1) optionBMarks += longMarksList[idxLong];
                    });

                    const groupKey = `pair-${group.option_a.join(',')}-${group.option_b.join(',')}`;
                    orGroupMaxMarks[groupKey] = Math.max(optionAMarks, optionBMarks);
                }
            });
        }

        // Calculate total marks
        const processedOrGroups = new Set();

        // Add short question marks
        shortQuestions.forEach((qNum, idx) => {
            if (orGroupQuestions.has(qNum)) {
                // Find which OR group this belongs to
                let groupKey = null;

                or_groups.forEach(group => {
                    if (group.type === 'single' && group.options.includes(qNum)) {
                        groupKey = `${Math.min(...group.options)}-${Math.max(...group.options)}`;
                    } else if (group.type === 'pair' &&
                        (group.option_a.includes(qNum) || group.option_b.includes(qNum))) {
                        groupKey = `pair-${group.option_a.join(',')}-${group.option_b.join(',')}`;
                    }
                });

                if (groupKey && !processedOrGroups.has(groupKey)) {
                    totalMarks += orGroupMaxMarks[groupKey];
                    processedOrGroups.add(groupKey);
                }
            } else {
                totalMarks += shortMarksList[idx];
            }
        });

        // Add long question marks
        longQuestions.forEach((qNum, idx) => {
            if (orGroupQuestions.has(qNum)) {
                let groupKey = null;

                or_groups.forEach(group => {
                    if (group.type === 'single' && group.options.includes(qNum)) {
                        groupKey = `${Math.min(...group.options)}-${Math.max(...group.options)}`;
                    } else if (group.type === 'pair' &&
                        (group.option_a.includes(qNum) || group.option_b.includes(qNum))) {
                        groupKey = `pair-${group.option_a.join(',')}-${group.option_b.join(',')}`;
                    }
                });

                if (groupKey && !processedOrGroups.has(groupKey)) {
                    totalMarks += orGroupMaxMarks[groupKey];
                    processedOrGroups.add(groupKey);
                }
            } else {
                totalMarks += longMarksList[idx];
            }
        });

        const exam_id = generateExamId(exam_name, class_name, subject);

        await sequelize.transaction(async (transaction) => {
            await Exam.create({
                exam_id,
                user_id: req.user.user_id,
                exam_name,
                class: class_name,
                subject,
                total_marks: totalMarks  // NOW THIS IS CORRECT!
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
                    const extractedRollNo = roll_no || studentResult.student_info.roll_no;
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
            or_groups: [],
            students: []
        };

        exam.questions.forEach(q => {
            examData.question_types[q.question_number] = q.question_type;
            examData.question_marks[q.question_number] = q.max_marks;
            examData.teacher_answers[`Q${q.question_number}`] = q.teacher_answer;
        });

        // Build or_groups
        examData.or_groups = exam.or_groups.map(g => ({
            type: g.group_type,
            options: JSON.parse(g.option_a),
            option_b: g.option_b ? JSON.parse(g.option_b) : []
        }));


        const orQuestions = new Set();
        examData.or_groups.forEach(g => {
            if (g.type === 'single') {
                orQuestions.add(g.options[1].toString());
            } else if (g.type === 'pair') {
                g.option_b.forEach(q => orQuestions.add(q.toString()));
            }
        });

        examData.effective_total_marks = Object.entries(examData.question_marks)
            .filter(([qNum]) => !orQuestions.has(qNum.toString()))
            .reduce((sum, [, marks]) => sum + marks, 0);

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

// GET: Registration page
exports.getRegisterBarcodeStudents = async (req, res) => {
    try {
        res.render('registerBarcodeStudents', {
            user: req.user,
            title: 'Register Public Exam Students'
        });
    } catch (error) {
        console.error('Error loading page:', error);
        res.status(500).send('Server error');
    }
};

exports.postRegisterBarcodeStudents = async (req, res) => {
    try {
        const { exam_id, barcode_prefix, students } = req.body;
        const userId = req.user.user_id;

        console.log('📝 Register barcode students request:', {
            exam_id,
            barcode_prefix,
            student_count: students?.length
        });

        if (!exam_id || !students || students.length === 0) {
            return res.status(400).json({
                status: 'failed',
                error: 'Missing exam_id or students'
            });
        }

        // ✅ AUTO-INCREMENT: Find the highest existing barcode number for this prefix
        const existingBarcodes = await sequelize.query(`
            SELECT barcode_id FROM barcode_student_mappings 
            WHERE barcode_id LIKE :prefix
            ORDER BY barcode_id DESC
            LIMIT 1
        `, {
            replacements: { prefix: `${barcode_prefix}%` },
            type: sequelize.QueryTypes.SELECT
        });

        // Calculate starting number
        let startNumber = 1;
        if (existingBarcodes.length > 0) {
            const lastBarcode = existingBarcodes[0].barcode_id;
            const lastNumber = parseInt(lastBarcode.replace(barcode_prefix, ''));
            startNumber = lastNumber + 1;
            console.log(`✅ Auto-increment: Last barcode was ${lastBarcode}, starting from ${barcode_prefix}${String(startNumber).padStart(5, '0')}`);
        } else {
            console.log(`✅ First batch: Starting from ${barcode_prefix}00001`);
        }

        // Create batch record
        const batchResult = await sequelize.query(`
            INSERT INTO barcode_batches (exam_id, prefix, start_number, total_count, generated_by)
            VALUES (:exam_id, :prefix, :start_number, :count, :user_id)
            RETURNING batch_id
        `, {
            replacements: {
                exam_id,
                prefix: barcode_prefix,
                start_number: startNumber,
                count: students.length,
                user_id: userId
            },
            type: sequelize.QueryTypes.INSERT
        });

        const batch_id = batchResult[0][0].batch_id;

        console.log(`✅ Created batch ${batch_id}`);

        // Create student mappings with auto-incremented barcode IDs
        const mappings = [];

        for (let i = 0; i < students.length; i++) {
            const student = students[i];
            const barcodeNumber = startNumber + i;
            const barcode_id = `${barcode_prefix}${String(barcodeNumber).padStart(5, '0')}`;

            await sequelize.query(`
                INSERT INTO barcode_student_mappings 
                (barcode_id, exam_id, batch_id, student_name, roll_no, class, registration_no, created_by)
                VALUES (:barcode_id, :exam_id, :batch_id, :name, :roll_no, :class, :reg_no, :user_id)
            `, {
                replacements: {
                    barcode_id,
                    exam_id,
                    batch_id,
                    name: student.name,
                    roll_no: student.roll_no,
                    class: student.class || '',
                    reg_no: student.registration_no || '',
                    user_id: userId
                }
            });

            mappings.push({
                barcode_id,
                student_name: student.name,
                roll_no: student.roll_no,
                class: student.class || '',
                registration_no: student.registration_no || ''
            });
        }

        console.log(`✅ Created ${mappings.length} barcode mappings starting from ${barcode_prefix}${String(startNumber).padStart(5, '0')}`);

        // Get exam details for PDF
        const [exams] = await sequelize.query(`
            SELECT exam_name, subject, class FROM exams WHERE exam_id = :exam_id
        `, {
            replacements: { exam_id },
            type: sequelize.QueryTypes.SELECT
        });

        const exam = exams[0] || {};

        // Call Python backend to generate PDF with QR codes
        console.log('🐍 Calling Python backend to generate PDF...');

        const pythonResponse = await fetch('http://localhost:5000/api/generate_barcode_facing_sheets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                batch_id,
                mappings,
                exam_details: {
                    exam_name: exam.exam_name || 'SEMESTER DEGREE EXAMINATION 2024',
                    course_code: '',
                    branch: '',
                    subject_name: exam.subject || ''
                }
            })
        });

        const pythonData = await pythonResponse.json();

        if (pythonData.status === 'success') {
            console.log('✅ PDF generated successfully');
        } else {
            console.warn('⚠️ PDF generation had issues:', pythonData);
        }

        // ✅ RETURN STUDENT LIST WITH BARCODE IDs
        res.json({
            status: 'success',
            batch_id,
            total_students: students.length,
            students: mappings,  // ← IMPORTANT: Return full student list with barcode IDs
            pdf_download_url: `/api/download-facing-sheets/${batch_id}`
        });

    } catch (error) {
        console.error('❌ Error registering students:', error);
        res.status(500).json({
            status: 'failed',
            error: error.message
        });
    }
};



exports.downloadFacingSheets = async (req, res) => {
    try {
        const batch_id = req.params.batch_id;
        const path = require('path');
        const fs = require('fs');

        // PDF should be in Node.js project's generated_pdfs folder
        const pdfPath = path.join(__dirname, '../../generated_pdfs', `facing_sheets_batch_${batch_id}.pdf`);

        console.log('Looking for PDF at:', pdfPath);

        // Check if file exists
        if (!fs.existsSync(pdfPath)) {
            console.error('❌ PDF not found at:', pdfPath);
            return res.status(404).send('PDF not found. Please generate it first.');
        }

        console.log('✅ PDF found, sending download...');
        res.download(pdfPath, `facing_sheets_batch_${batch_id}.pdf`);

    } catch (error) {
        console.error('Error downloading PDF:', error);
        res.status(500).send('Error downloading PDF: ' + error.message);
    }
};


exports.downloadSampleCSV = (req, res) => {
    const csvContent = `name,roll_no,class,registration_no
John Doe,101,S8-CSE,KTU2024001
Jane Smith,102,S8-CSE,KTU2024002
Bob Johnson,103,S8-CSE,KTU2024003`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=sample_students.csv');
    res.send(csvContent);
};

// GET: Fetch user's exams for dropdown
exports.getUserExams = async (req, res) => {
    try {
        const userId = req.user.user_id;

        const exams = await Exam.findAll({
            where: { user_id: userId },
            attributes: ['exam_id', 'exam_name', 'class', 'subject', 'total_marks', 'created_at'],
            order: [['created_at', 'DESC']],
            raw: true
        });

        console.log(`Found ${exams.length} exams for user ${userId}`);

        res.json({
            status: 'success',
            exams: exams
        });
    } catch (error) {
        console.error('Error fetching exams:', error);
        res.status(500).json({
            status: 'error',
            error: error.message,
            exams: []
        });
    }
};

// ============================================
// BARCODE EVALUATION CONTROLLER METHODS
// ============================================

// Get Student by Barcode ID
exports.getStudentByBarcode = async (req, res) => {
    try {
        const { barcode_id, exam_id } = req.query;

        console.log('🔍 Looking up barcode:', { barcode_id, exam_id });

        if (!barcode_id || !exam_id) {
            return res.status(400).json({
                success: false,
                message: 'Barcode ID and Exam ID are required'
            });
        }

        // ✅ REMOVE THE [students] DESTRUCTURING!
        const students = await sequelize.query(`
            SELECT 
                barcode_id,
                student_name,
                roll_no,
                class,
                registration_no,
                exam_id
            FROM barcode_student_mappings
            WHERE barcode_id = :barcode_id 
            AND exam_id = :exam_id
        `, {
            replacements: { barcode_id, exam_id },
            type: sequelize.QueryTypes.SELECT
        });

        console.log('📊 Query result:', students);
        console.log('📊 Students found:', students.length);

        if (students.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Student not found for barcode ${barcode_id} in this exam`
            });
        }

        console.log('✅ Student found:', students[0]);

        res.json({
            success: true,
            student: students[0]
        });

    } catch (error) {
        console.error('❌ Error getting student by barcode:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve student information',
            error: error.message
        });
    }
};

// Evaluate Barcode Submission
// ============================================
// REPLACE these two functions in evaluationController.js
// ============================================

// Evaluate Barcode Submission
exports.evaluateBarcodeSubmission = async (req, res) => {
    try {
        const { exam_id, barcode_id } = req.body;
        const userId = req.user.user_id;
        const answerScriptFiles = req.files;

        console.log('📝 Barcode evaluation request:', {
            exam_id,
            barcode_id,
            files: answerScriptFiles?.length || 0
        });

        if (!exam_id || !barcode_id || !answerScriptFiles || answerScriptFiles.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields or answer script files'
            });
        }

        // Load exam with questions and OR groups (same pattern as postEvaluate)
        const exam = await Exam.findOne({
            where: { exam_id, user_id: userId },
            include: [
                { model: Question, as: 'questions' },
                { model: OrGroup, as: 'or_groups' }
            ]
        });

        if (!exam) {
            return res.status(404).json({
                success: false,
                message: `Exam not found or access denied for exam_id: ${exam_id}`
            });
        }

        // Verify student exists in barcode mappings
        const students = await sequelize.query(`
            SELECT barcode_id, student_name, roll_no, class, registration_no
            FROM barcode_student_mappings
            WHERE barcode_id = :barcode_id AND exam_id = :exam_id
        `, {
            replacements: { barcode_id, exam_id },
            type: sequelize.QueryTypes.SELECT
        });

        if (students.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Student not found for barcode ${barcode_id} in exam ${exam_id}`
            });
        }

        const student = students[0];
        console.log('✅ Student found:', student.student_name, '| Roll:', student.roll_no);

        // Build exam data for Python (same structure as postEvaluate)
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

        // Send to Python /api/evaluate_individual_with_data (same as postEvaluate)
        const formData = new FormData();
        formData.append('exam_data', JSON.stringify(examData));

        for (const file of answerScriptFiles) {
            formData.append('paper_images', fs.createReadStream(file.path), {
                filename: file.originalname,
                contentType: file.mimetype
            });
        }

        console.log('🚀 Sending to Python for OCR + evaluation...');

        const pythonResponse = await valuationService.sendToPythonAPI(
            formData,
            '/api/evaluate_individual_with_data',
            {
                headers: { ...formData.getHeaders() },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                timeout: 180000
            }
        );

        if (pythonResponse.status !== 'Success') {
            return res.status(500).json({
                success: false,
                message: 'Python evaluation failed',
                error: pythonResponse.error || 'Unknown error'
            });
        }

        console.log('✅ Python evaluation complete');

        const evalResult = pythonResponse.evaluation_result;
        const recognitionResult = pythonResponse.recognition_result;
        const totalMarksObtained = evalResult.total_marks_obtained;
        const percentage = evalResult.percentage;
        const marksBreakdown = evalResult.marks_breakdown;

        // Save/update submission in DB (same pattern as postEvaluateSeriesBatch)
        let submission = await Submission.findOne({
            where: { exam_id, roll_no: student.roll_no }
        });

        if (!submission) {
            submission = await Submission.create({
                exam_id,
                roll_no: student.roll_no,
                student_name: student.student_name,
                valuation_status: 'completed',
                total_marks_obtained: totalMarksObtained,
                percentage: percentage
            });
        } else {
            await Submission.update(
                {
                    valuation_status: 'completed',
                    total_marks_obtained: totalMarksObtained,
                    percentage: percentage
                },
                { where: { submission_id: submission.submission_id } }
            );
        }

        // Save per-question answers and marks
        const studentAnswers = recognitionResult.answers || {};
        const answersToInsert = [];

        for (const [qLabel, answerText] of Object.entries(studentAnswers)) {
            const qNum = parseInt(qLabel.replace('Q', ''));
            const breakdown = marksBreakdown[qLabel] || {};

            answersToInsert.push({
                submission_id: submission.submission_id,
                question_number: qNum,
                answer_text: answerText,
                marks_obtained: breakdown.marks_obtained ?? null,
                is_or_question: breakdown.or_group || false,
                or_option_chosen: breakdown.chosen_option || null
            });
        }

        // Delete old answers then re-insert cleanly
        await StudentAnswer.destroy({
            where: { submission_id: submission.submission_id }
        });
        await StudentAnswer.bulkCreate(answersToInsert);

        console.log(`✅ Saved ${answersToInsert.length} answers for ${student.student_name}`);

        return res.json({
            success: true,
            message: 'Evaluation completed successfully',
            submission_id: submission.submission_id,
            student: {
                name: student.student_name,
                roll_no: student.roll_no,
                barcode_id: student.barcode_id
            },
            result: {
                total_marks_obtained: totalMarksObtained,
                total_marks_possible: evalResult.total_marks_possible,
                percentage: percentage,
                result: evalResult.result,
                marks_breakdown: marksBreakdown
            }
        });

    } catch (error) {
        console.error('❌ Barcode evaluation error:', error);
        res.status(500).json({
            success: false,
            message: 'Evaluation failed',
            error: error.message
        });
    } finally {
        if (req.files) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlink(file.path, err => {
                        if (err) console.error('Cleanup error:', err);
                    });
                }
            });
        }
    }
};


// Get Barcode Evaluation Results
exports.getBarcodeResults = async (req, res) => {
    try {
        const { submission_id } = req.params;
        const userId = req.user.user_id;

        // Fixed: removed wrong [submissions] destructuring, use correct join
        const submissions = await sequelize.query(`
            SELECT 
                s.submission_id,
                s.exam_id,
                s.roll_no,
                s.student_name,
                s.valuation_status,
                s.total_marks_obtained,
                s.percentage,
                s.created_at,
                e.exam_name,
                e.subject,
                e.class,
                e.total_marks as exam_total_marks
            FROM submissions s
            JOIN exams e ON s.exam_id = e.exam_id
            WHERE s.submission_id = :submission_id
            AND e.user_id = :userId
        `, {
            replacements: { submission_id, userId },
            type: sequelize.QueryTypes.SELECT
        });

        if (submissions.length === 0) {
            return res.status(404).render('error', {
                message: 'Submission not found'
            });
        }

        const submission = submissions[0];

        // Get per-question answers with marks
        const answers = await StudentAnswer.findAll({
            where: { submission_id },
            order: [['question_number', 'ASC']],
            raw: true
        });

        // Get question max marks for display
        const questions = await Question.findAll({
            where: { exam_id: submission.exam_id },
            order: [['question_number', 'ASC']],
            raw: true
        });

        const questionMap = {};
        questions.forEach(q => {
            questionMap[q.question_number] = q;
        });

        res.render('resultsBarcodeEvaluation', {
            title: 'Evaluation Results',
            submission,
            answers,
            questionMap,
            user: req.user
        });

    } catch (error) {
        console.error('Error getting barcode results:', error);
        res.status(500).render('error', {
            message: 'Failed to load results'
        });
    }
};

// Download Student List (after FIX 2)
exports.downloadStudentList = async (req, res) => {
    try {
        const { batch_id } = req.params;
        const userId = req.user.user_id;
        const format = req.query.format || 'pdf';

        console.log(`📥 Downloading student list for batch ${batch_id} in ${format} format`);

        // Get students for this batch
        const students = await sequelize.query(`
            SELECT 
                barcode_id,
                student_name,
                roll_no,
                class,
                registration_no
            FROM barcode_student_mappings
            WHERE batch_id = :batch_id
            AND created_by = :userId
            ORDER BY barcode_id ASC
        `, {
            replacements: { batch_id, userId },
            type: sequelize.QueryTypes.SELECT
        });

        if (students.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No students found for this batch'
            });
        }

        console.log(`✅ Found ${students.length} students for batch ${batch_id}`);

        // Get batch details with LEFT JOIN
        const batches = await sequelize.query(`
            SELECT b.*, e.exam_name, e.subject
            FROM barcode_batches b
            LEFT JOIN exams e ON b.exam_id = e.exam_id
            WHERE b.batch_id = :batch_id
        `, {
            replacements: { batch_id },
            type: sequelize.QueryTypes.SELECT
        });

        if (batches.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Batch not found'
            });
        }

        const batch = batches[0];

        // Default values if exam data is missing
        const examName = batch.exam_name || 'Exam';
        const examSubject = batch.subject || 'Subject';

        console.log(`✅ Exam: ${examName}, Subject: ${examSubject}`);

        if (format === 'excel') {
            // ========== EXCEL FORMAT ==========
            const XLSX = require('xlsx');

            const data = [
                ['STUDENT LIST - BARCODE ASSIGNMENT'],
                ['Exam:', examName],
                ['Subject:', examSubject],
                ['Total Students:', students.length],
                ['Generated:', new Date().toLocaleDateString()],
                [],
                ['Sr.', 'Barcode ID', 'Student Name', 'Roll No', 'Class', 'Registration No']
            ];

            students.forEach((student, index) => {
                data.push([
                    index + 1,
                    student.barcode_id,
                    student.student_name,
                    student.roll_no,
                    student.class || '',
                    student.registration_no || ''
                ]);
            });

            const ws = XLSX.utils.aoa_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Students');

            // Set column widths
            ws['!cols'] = [
                { wch: 5 },  // Sr.
                { wch: 18 }, // Barcode ID
                { wch: 30 }, // Name
                { wch: 12 }, // Roll No
                { wch: 10 }, // Class
                { wch: 20 }  // Registration No
            ];

            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=student_list_batch_${batch_id}.xlsx`);
            res.send(buffer);

            console.log('✅ Excel file sent successfully');

        } else {
            // ========== PDF FORMAT ==========
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({ margin: 50 });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=student_list_batch_${batch_id}.pdf`);
            doc.pipe(res);

            // Title
            doc.fontSize(18).font('Helvetica-Bold').text('STUDENT LIST - BARCODE ASSIGNMENT', { align: 'center' });
            doc.moveDown(0.5);

            // Exam details
            doc.fontSize(11).font('Helvetica');
            doc.text(`Exam: ${examName}`);
            doc.text(`Subject: ${examSubject}`);
            doc.text(`Total Students: ${students.length}`);
            doc.text(`Generated: ${new Date().toLocaleDateString()}`);
            doc.moveDown(1);

            // Table header
            doc.fontSize(9).font('Helvetica-Bold');
            const y = doc.y;
            doc.text('Sr.', 50, y, { width: 30 });
            doc.text('Barcode ID', 80, y, { width: 100 });
            doc.text('Student Name', 200, y, { width: 150 });
            doc.text('Roll No', 360, y, { width: 80 });
            doc.text('Class', 450, y, { width: 60 });

            doc.moveDown(0.5);
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown(0.5);

            // Table rows
            doc.font('Helvetica').fontSize(8);
            students.forEach((student, index) => {
                const rowY = doc.y;

                doc.text(index + 1, 50, rowY, { width: 30 });
                doc.text(student.barcode_id, 80, rowY, { width: 100 });
                doc.text(student.student_name, 200, rowY, { width: 150 });
                doc.text(student.roll_no, 360, rowY, { width: 80 });
                doc.text(student.class || '-', 450, rowY, { width: 60 });

                doc.moveDown(0.7);

                // Add new page if needed
                if (doc.y > 700) {
                    doc.addPage();
                    doc.fontSize(9).font('Helvetica-Bold');
                    const newY = 50;
                    doc.text('Sr.', 50, newY, { width: 30 });
                    doc.text('Barcode ID', 80, newY, { width: 100 });
                    doc.text('Student Name', 200, newY, { width: 150 });
                    doc.text('Roll No', 360, newY, { width: 80 });
                    doc.text('Class', 450, newY, { width: 60 });
                    doc.moveDown(1);
                    doc.font('Helvetica').fontSize(8);
                }
            });

            doc.end();
            console.log('✅ PDF file sent successfully');
        }

    } catch (error) {
        console.error('❌ Error downloading student list:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate student list',
            error: error.message
        });
    }
};

// Check which exam a barcode belongs to
exports.checkBarcodeExam = async (req, res) => {
    try {
        const { barcode_id } = req.query;

        if (!barcode_id) {
            return res.status(400).json({
                success: false,
                message: 'Barcode ID is required'
            });
        }

        const results = await sequelize.query(`
            SELECT 
                b.barcode_id,
                b.student_name,
                b.exam_id,
                e.exam_name,
                e.subject,
                e.class
            FROM barcode_student_mappings b
            LEFT JOIN exams e ON b.exam_id = e.exam_id
            WHERE b.barcode_id = :barcode_id
            LIMIT 1
        `, {
            replacements: { barcode_id },
            type: sequelize.QueryTypes.SELECT
        });

        if (results.length === 0) {
            return res.json({
                success: false,
                message: 'Barcode not found in any exam'
            });
        }

        const student = results[0];

        res.json({
            success: true,
            barcode_id: student.barcode_id,
            student_name: student.student_name,
            exam_id: student.exam_id,
            exam_name: student.exam_name || 'Unknown Exam',
            subject: student.subject,
            class: student.class
        });

    } catch (error) {
        console.error('Error checking barcode exam:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check barcode',
            error: error.message
        });
    }
};