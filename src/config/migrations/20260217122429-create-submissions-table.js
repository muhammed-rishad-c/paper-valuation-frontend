'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {

    // Create submissions table
    // Each row = one student's paper for one exam
    // Comes AFTER exams table because it references exam_id
    await queryInterface.createTable('submissions', {

      submission_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },

      exam_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
        references: {
          model: 'exams',
          key: 'exam_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'   // Delete exam → delete all student papers
      },

      roll_no: {
        type: Sequelize.STRING(50),
        allowNull: false
        // Unique per exam enforced by constraint below
      },

      student_name: {
        type: Sequelize.STRING(100),
        allowNull: true   // OCR might fail to read name - allow null
      },

      valuation_status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'pending'
        // 'pending' → paper uploaded but not evaluated yet
        // 'completed' → AI has evaluated and marks are assigned
        // 'error' → something went wrong during evaluation
      },

      total_marks_obtained: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true   // Null until evaluation completes
      },

      percentage: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true   // Null until evaluation completes
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

    // Unique constraint: same student can't submit twice for same exam
    await queryInterface.addConstraint('submissions', {
      fields: ['exam_id', 'roll_no'],
      type: 'unique',
      name: 'unique_student_per_exam'
    });

    // Index for fast "get all submissions for exam X" queries
    await queryInterface.addIndex('submissions', ['exam_id'], {
      name: 'idx_submissions_exam_id'
    });

    // Index for finding a specific student's submission
    await queryInterface.addIndex('submissions', ['roll_no'], {
      name: 'idx_submissions_roll_no'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('submissions');
  }
};