const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');
const { upload } = require('../services/multerSetup'); 


router.get('/', evaluationController.getIndexPage);


router.get('/upload-individual', evaluationController.getUploadPage);
router.post('/individualEvaluate', upload.array('paper_images', 10), evaluationController.postEvaluate);




router.get('/answer-key-setup', evaluationController.getAnswerKeySetup);


router.post('/api/extract-answer-key', upload.single('answer_key_image'), evaluationController.postExtractAnswerKey);


router.post('/api/save-answer-key', express.json(), evaluationController.postSaveAnswerKey);


router.get('/upload-series', evaluationController.getSeriesBatch);


router.post('/seriesBundleEvaluate', upload.any(), evaluationController.postEvaluateSeriesBatch);

module.exports = router;