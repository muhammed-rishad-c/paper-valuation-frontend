'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {

    // Create exams table
    // Comes AFTER users table because it references user_id
    await queryInterface.createTable('exams', {

      exam_id: {
        type: Sequelize.STRING(100),
        primaryKey: true
        // We generate this ourselves e.g. "MATH_S5_001_ABC123"
        // NOT auto-increment because we want custom string IDs
      },

      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',   // ← Points to users table
          key: 'user_id'    // ← Specifically the user_id column
        },
        onUpdate: 'CASCADE',  // If user_id changes in users table, update here too
        onDelete: 'CASCADE'   // If teacher deleted, delete all their exams too
      },

      exam_name: {
        type: Sequelize.STRING(200),
        allowNull: false
      },

      class: {
        type: Sequelize.STRING(50),
        allowNull: false
      },

      subject: {
        type: Sequelize.STRING(100),
        allowNull: false
      },

      total_marks: {
        type: Sequelize.INTEGER,
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

    // Index on user_id for fast "get all exams for teacher X" queries
    await queryInterface.addIndex('exams', ['user_id'], {
      name: 'idx_exams_user_id'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('exams');
  }
};
