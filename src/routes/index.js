const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');
const { upload } = require('../services/multerSetup');

// Import auth middleware we created in Step 4
// requireAuth     → checks if user is logged in
// requireExamOwner → checks if user owns the specific exam
const { requireAuth, requireExamOwner } = require('../middleware/auth');

// ==========================================
// PUBLIC ROUTES
// No login required
// ==========================================

// Homepage/Dashboard
// Public because user needs to land somewhere before login
router.get('/', requireAuth, evaluationController.getIndexPage);
// ==========================================
// PROTECTED ROUTES
// requireAuth runs FIRST before the controller
// If not logged in → redirected to /login automatically
// If logged in → controller runs normally
// ==========================================

// Individual valuation pages
router.get('/upload-individual',
  requireAuth,                        // ← Check login first
  evaluationController.getUploadPage
);

router.post('/individualEvaluate',
  requireAuth,                        // ← Check login first
  upload.array('paper_images', 10),
  evaluationController.postEvaluate
);

// Answer key setup
router.get('/answer-key-setup',
  requireAuth,                          // ← Check login first
  evaluationController.getAnswerKeySetup
);

router.post('/api/extract-answer-key',
  requireAuth,                              // ← Check login first
  upload.single('answer_key_image'),
  evaluationController.postExtractAnswerKey
);

router.post('/api/save-answer-key',
  requireAuth,                            // ← Check login first
  express.json(),
  evaluationController.postSaveAnswerKey
);

// Series valuation
router.get('/upload-series',
  requireAuth,                          // ← Check login first
  evaluationController.getSeriesBatch
);

router.post('/seriesBundleEvaluate',
  requireAuth,                                // ← Check login first
  upload.any(),
  evaluationController.postEvaluateSeriesBatch
);

// ==========================================
// DOUBLE PROTECTED ROUTES
// requireAuth     → Are you logged in?
// requireExamOwner → Do you OWN this exam?
// Both must pass!
// ==========================================

// Valuation preparation page
// Example: /valuation-prep/MATH_S5_001
// Teacher A cannot access Teacher B's exam even if they know the URL!
router.get('/valuation-prep/:exam_id',
  requireAuth,          // ← Step 1: Are you logged in?
  requireExamOwner,     // ← Step 2: Do you own this exam?
  evaluationController.getValuationPrep
);

// Evaluate all students in an exam
router.post('/api/evaluate_exam/:exam_id',
  requireAuth,          // ← Step 1: Are you logged in?
  requireExamOwner,     // ← Step 2: Do you own this exam?
  evaluationController.postEvaluateExam
);

// ==========================================
// PROTECTED API ROUTES
// These return JSON not HTML pages
// If not logged in → 401 error instead of redirect
// ==========================================

// List answer keys (only current user's exams)
router.get('/api/list_answer_keys',
  requireAuth,                          // ← Check login first
  evaluationController.getAnswerKeysList
);

module.exports = router;