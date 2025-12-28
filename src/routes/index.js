const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');
const { upload } = require('../services/multerSetup'); 

// GET: Render the upload page
router.get('/',evaluationController.getIndexPage);

router.get('/upload-individual', evaluationController.getUploadPage);

router.post('/individualEvaluate', upload.array('paper_images', 10), evaluationController.postEvaluate);

router.get('/upload-series',evaluationController.getSeriesBatch);

router.post('/seriesBundleEvaluate',upload.any(),evaluationController.postEvaluateSeriesBatch)

module.exports = router;