// src/utils/examHelpers.js
// Helper functions for exam management

const crypto = require('crypto');

/**
 * Generate unique exam ID
 * Format: SUBJECT_CLASS_EXAMNAME_RANDOM
 * Example: MATH_S5_MIDTERM_A3F7B2C9
 */
function generateExamId(examName, className, subject) {
  const base = `${subject}_${className}_${examName.replace(/\s+/g, '_')}`;
  const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${base}_${randomSuffix}`;
}

/**
 * Parse question range string
 * Examples: "1-5" → [1,2,3,4,5]
 *          "1,3,5" → [1,3,5]
 *          "1-3,5,7-9" → [1,2,3,5,7,8,9]
 */
function parseQuestionRange(rangeStr) {
  if (!rangeStr || !rangeStr.trim()) {
    return [];
  }

  const questions = [];
  const parts = rangeStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
      for (let i = start; i <= end; i++) {
        questions.push(i);
      }
    } else {
      questions.push(parseInt(trimmed));
    }
  }

  return questions;
}

/**
 * Parse marks string
 * Examples: "5" → [5,5,5,5] (for 4 questions)
 *          "5,10,5" → [5,10,5]
 */
function parseMarksString(marksStr, questionCount) {
  if (!marksStr || !marksStr.trim()) {
    throw new Error('Marks string cannot be empty');
  }

  const trimmed = marksStr.trim();

  // Single number - apply to all questions
  if (!trimmed.includes(',')) {
    const mark = parseInt(trimmed);
    if (mark <= 0) {
      throw new Error('Marks must be positive');
    }
    return Array(questionCount).fill(mark);
  }

  // Comma-separated - must match question count
  const marks = trimmed.split(',').map(m => parseInt(m.trim()));

  if (marks.some(m => m <= 0)) {
    throw new Error('All marks must be positive');
  }

  if (marks.length !== questionCount) {
    throw new Error(
      `Marks count mismatch: provided ${marks.length} marks but have ${questionCount} questions`
    );
  }

  return marks;
}

module.exports = {
  generateExamId,
  parseQuestionRange,
  parseMarksString
};