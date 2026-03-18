const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');
const { upload } = require('../services/multerSetup');
const { requireAuth, requireExamOwner } = require('../middleware/auth');


router.get('/', requireAuth, evaluationController.getIndexPage);
router.get('/api/dashboard/stats', requireAuth, evaluationController.getDashboardStats);


router.get('/profile', requireAuth, evaluationController.getProfile);
router.post('/api/update-profile', requireAuth, evaluationController.postUpdateProfile);
router.post('/api/change-password', requireAuth, evaluationController.postChangePassword);


router.get('/history', requireAuth, evaluationController.getHistory);
router.get('/api/history', requireAuth, evaluationController.getHistoryData);


router.get('/api/export/pdf/:exam_id', requireAuth, requireExamOwner, evaluationController.exportPDF);
router.get('/api/export/excel/:exam_id', requireAuth, requireExamOwner, evaluationController.exportExcel);


router.get('/answer-key-setup', requireAuth, evaluationController.getAnswerKeySetup);
router.post('/api/extract-answer-key', requireAuth, upload.single('answer_key_image'), evaluationController.postExtractAnswerKey);
router.post('/api/save-answer-key', requireAuth, express.json(), evaluationController.postSaveAnswerKey);
router.get('/api/list_answer_keys', requireAuth, evaluationController.getAnswerKeysList);


router.get('/upload-individual', requireAuth, evaluationController.getUploadPage);
router.post('/individualEvaluate', requireAuth, upload.array('paper_images', 10), evaluationController.postEvaluate);

 
router.get('/upload-series', requireAuth, evaluationController.getSeriesBatch);
router.post('/seriesBundleEvaluate', requireAuth, upload.any(), evaluationController.postEvaluateSeriesBatch);
 

router.get('/valuation-prep/:exam_id', requireAuth, requireExamOwner, evaluationController.getValuationPrep);
router.post('/api/evaluate_exam/:exam_id', requireAuth, requireExamOwner, evaluationController.postEvaluateExam);
 

router.get('/register-barcode-students', requireAuth, evaluationController.getRegisterBarcodeStudents);
router.post('/api/register-barcode-students', requireAuth, evaluationController.postRegisterBarcodeStudents);
router.get('/api/download-facing-sheets/:batch_id', requireAuth, evaluationController.downloadFacingSheets);
router.get('/api/download-sample-csv', requireAuth, evaluationController.downloadSampleCSV);

  
router.get('/api/get-user-exams', requireAuth, evaluationController.getUserExams);

// ============================================
// BARCODE EVALUATION ROUTES
// ============================================

// Barcode Evaluation Page
router.get('/barcode-evaluation', requireAuth, (req, res) => {
    res.render('barcodeEvaluation');
});

// Get Student by Barcode ID
router.get('/api/get-student-by-barcode', requireAuth, evaluationController.getStudentByBarcode);

// Evaluate Barcode Submission
router.post('/api/evaluate-barcode-submission', requireAuth, upload.array('answer_script', 20), evaluationController.evaluateBarcodeSubmission);
// Barcode Results Page
router.get('/results-barcode/:submission_id', requireAuth, evaluationController.getBarcodeResults);

// Download Student List (PDF or Excel)
router.get('/api/download-student-list/:batch_id', requireAuth, evaluationController.downloadStudentList);

// Check which exam a barcode belongs to
router.get('/api/check-barcode-exam', requireAuth, evaluationController.checkBarcodeExam);

module.exports = router;   