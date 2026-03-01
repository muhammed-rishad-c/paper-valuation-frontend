
const { Exam } = require('../config/models');


function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {

    return next();
  }
  const isApiRequest = req.originalUrl.startsWith('/api/');

  if (isApiRequest) {
    return res.status(401).json({
      status: 'Failed',
      error: 'Authentication required. Please login first.'
    });
  }


  req.session.returnTo = req.originalUrl;
  console.log(`🔒 Unauthenticated access to ${req.originalUrl} - redirecting to login`);
  res.redirect('/login');
}


async function requireExamOwner(req, res, next) {
  try {
    const examId = req.params.exam_id || req.body.exam_id;

    if (!examId) {
      return res.status(400).json({
        status: 'Failed',
        error: 'Exam ID is required'
      });
    }

  
    const exam = await Exam.findOne({
      where: {
        exam_id: examId,
        user_id: req.user.user_id  
      }
    });

    if (!exam) {
      console.log(`🚫 Access denied: ${req.user.username} tried to access exam ${examId}`);
      return res.status(403).json({
        status: 'Failed',
        error: 'Access denied. You do not have permission to access this exam.'
      });
    }


    req.exam = exam;
    console.log(`✅ Exam ownership verified: ${req.user.username} → ${examId}`);
    next();

  } catch (error) {
    console.error('❌ requireExamOwner error:', error.message);
    res.status(500).json({
      status: 'Failed',
      error: 'Internal server error'
    });
  }
}


function redirectIfAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  next();
}

module.exports = {
  requireAuth,
  requireExamOwner,
  redirectIfAuthenticated
};