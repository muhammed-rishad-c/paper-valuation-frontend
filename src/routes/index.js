const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');
const { upload } = require('../services/multerSetup'); 

// GET: Render the home page
router.get('/', evaluationController.getIndexPage);

// Individual Paper Evaluation Routes
router.get('/upload-individual', evaluationController.getUploadPage);
router.post('/individualEvaluate', upload.array('paper_images', 10), evaluationController.postEvaluate);

// ============================================
// ANSWER KEY SETUP ROUTES (NEW - 3 Step Wizard)
// ============================================

// Step 1: Render the answer key setup form (metadata entry)
router.get('/answer-key-setup', evaluationController.getAnswerKeySetup);

// Step 2: Extract text from uploaded answer key image (AJAX endpoint)
router.post('/api/extract-answer-key', upload.single('answer_key_image'), evaluationController.postExtractAnswerKey);

// Step 3: Save complete answer key with all metadata and answers
// ADD express.json() middleware HERE for this specific route
router.post('/api/save-answer-key', express.json(), evaluationController.postSaveAnswerKey);

// ============================================
// SERIES BATCH EVALUATION ROUTES
// ============================================

// Render the series batch upload page
router.get('/upload-series', evaluationController.getSeriesBatch);

// Process batch evaluation with exam_id linkage
router.post('/seriesBundleEvaluate', upload.any(), evaluationController.postEvaluateSeriesBatch);

module.exports = router;