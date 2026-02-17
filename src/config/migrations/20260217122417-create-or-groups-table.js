'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {

    // Create or_groups table
    // Stores the OR question rules for each exam
    // e.g. "Student can answer Q5 OR Q6, system picks best"
    await queryInterface.createTable('or_groups', {

      or_group_id: {
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
        onDelete: 'CASCADE'   // Delete exam → delete its OR rules too
      },

      group_type: {
        type: Sequelize.STRING(20),
        allowNull: false
        // 'single' = Q5 OR Q6 (one question choice)
        // 'pair' = Q5+Q6 OR Q7+Q8 (two question choice)
      },

      option_a: {
        type: Sequelize.TEXT,
        allowNull: false
        // Stored as JSON string e.g. '["5"]' or '["5","6"]'
        // Remember: JSON.stringify() before saving, JSON.parse() when reading
      },

      option_b: {
        type: Sequelize.TEXT,
        allowNull: true
        // Only needed for 'pair' type
        // e.g. '["7","8"]'
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

    // Index for fast OR group lookups by exam
    await queryInterface.addIndex('or_groups', ['exam_id'], {
      name: 'idx_or_groups_exam_id'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('or_groups');
  }
};
