'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {

    // Create questions table
    // Comes AFTER exams table because it references exam_id
    await queryInterface.createTable('questions', {

      question_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },

      exam_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
        references: {
          model: 'exams',   // ← Points to exams table
          key: 'exam_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'   // Delete exam → delete all its questions
      },

      question_number: {
        type: Sequelize.INTEGER,
        allowNull: false
        // e.g. 1 for Q1, 2 for Q2
      },

      question_type: {
        type: Sequelize.STRING(20),
        allowNull: false
        // Only 'short' or 'long' (validated in model)
      },

      max_marks: {
        type: Sequelize.INTEGER,
        allowNull: false
      },

      teacher_answer: {
        type: Sequelize.TEXT,   // TEXT for long answers (no length limit)
        allowNull: false
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

    // Unique constraint: same exam cannot have duplicate question numbers
    // e.g. Can't have two Q3 in same exam
    await queryInterface.addConstraint('questions', {
      fields: ['exam_id', 'question_number'],
      type: 'unique',
      name: 'unique_question_per_exam'
    });

    // Index for fast "get all questions for exam X" queries
    await queryInterface.addIndex('questions', ['exam_id'], {
      name: 'idx_questions_exam_id'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('questions');
  }
};