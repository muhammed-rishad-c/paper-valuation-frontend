const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');
const { upload } = require('../services/multerSetup'); 

// GET: Render the upload page
router.get('/', evaluationController.getUploadPage);


router.post('/evaluate', upload.array('paper_images', 10), evaluationController.postEvaluate);

module.exports = router;