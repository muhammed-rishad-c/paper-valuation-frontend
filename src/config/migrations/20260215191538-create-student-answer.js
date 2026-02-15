'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('StudentAnswers', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      submission_id: {
        type: Sequelize.INTEGER
      },
      question_number: {
        type: Sequelize.INTEGER
      },
      answer_text: {
        type: Sequelize.TEXT
      },
      marks_obtained: {
        type: Sequelize.DECIMAL
      },
      is_or_question: {
        type: Sequelize.BOOLEAN
      },
      or_option_chosen: {
        type: Sequelize.STRING
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('StudentAnswers');
  }
};