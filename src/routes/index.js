
const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');
const { upload } = require('../services/multerSetup'); 


router.get('/', evaluationController.getUploadPage);


router.post('/evaluate', upload.single('paper_image'), evaluationController.postEvaluate);

module.exports = router;