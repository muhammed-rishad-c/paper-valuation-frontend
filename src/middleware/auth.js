// src/middleware/auth.js
const { Exam } = require('../config/models');

// ==========================================
// requireAuth
// Protects routes that need login
// Smart: detects if request is from browser or API call
// ==========================================
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {
    // User is logged in → continue
    return next();
  }

  // User is NOT logged in
  // Check if this is an API request or browser request
  const isApiRequest = req.originalUrl.startsWith('/api/');

  if (isApiRequest) {
    // API request → return JSON error
    // JavaScript fetch() can handle this properly
    return res.status(401).json({
      status: 'Failed',
      error: 'Authentication required. Please login first.'
    });
  }

  // Browser request → redirect to login page
  // Save where they were trying to go
  req.session.returnTo = req.originalUrl;
  console.log(`🔒 Unauthenticated access to ${req.originalUrl} - redirecting to login`);
  res.redirect('/login');
}

// ==========================================
// requireExamOwner
// Checks if logged-in user OWNS the exam
// Prevents teachers from accessing each other's exams
// ==========================================
async function requireExamOwner(req, res, next) {
  try {
    const examId = req.params.exam_id || req.body.exam_id;

    if (!examId) {
      return res.status(400).json({
        status: 'Failed',
        error: 'Exam ID is required'
      });
    }

    // Query database with BOTH exam_id AND user_id
    // This is the security check!
    // Even if hacker knows exam_id, they won't pass if user_id doesn't match
    const exam = await Exam.findOne({
      where: {
        exam_id: examId,
        user_id: req.user.user_id  // Must match logged-in user!
      }
    });

    if (!exam) {
      console.log(`🚫 Access denied: ${req.user.username} tried to access exam ${examId}`);
      return res.status(403).json({
        status: 'Failed',
        error: 'Access denied. You do not have permission to access this exam.'
      });
    }

    // Attach exam to request so controller doesn't need to query again
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

// ==========================================
// redirectIfAuthenticated
// Prevents logged-in users from seeing login/register pages
// ==========================================
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