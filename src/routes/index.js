// src/routes/index.js
const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');
const { upload } = require('../services/multerSetup'); // Multer config from Step 6

// GET / - Renders the image upload form
router.get('/', evaluationController.getUploadPage);

// POST /evaluate - Handles file upload and forwards to Python
// 'paper_image' MUST match the name attribute in the HTML form and the key Flask expects.
router.post('/evaluate', upload.single('paper_image'), evaluationController.postEvaluate);

module.exports = router;