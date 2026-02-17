'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {

    // Create student_answers table
    // Each row = one student's answer to one question
    // Comes LAST because it references submissions
    // This will be the largest table in your database!
    await queryInterface.createTable('student_answers', {

      answer_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },

      submission_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'submissions',   // ← Points to submissions table
          key: 'submission_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'   // Delete submission → delete all their answers
      },

      question_number: {
        type: Sequelize.INTEGER,
        allowNull: false
        // 1 for Q1, 2 for Q2 etc
      },

      answer_text: {
        type: Sequelize.TEXT,
        allowNull: false
        // Raw text extracted by OCR from student's handwriting
        // Can be very long for essay/long answers
      },

      marks_obtained: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true   // Null until AI evaluates this specific answer
      },

      is_or_question: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false   // Most questions are regular, not OR
      },

      or_option_chosen: {
        type: Sequelize.STRING(10),
        allowNull: true
        // Only set when is_or_question = true
        // Value: 'a' or 'b' indicating which option student attempted
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Index for fast "get all answers for submission X" queries
    // This is the most important index because we query by submission_id constantly
    await queryInterface.addIndex('student_answers', ['submission_id'], {
      name: 'idx_student_answers_submission_id'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('student_answers');
  }
};