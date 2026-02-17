'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {

    // Create the users table
    // This is the FIRST table created because all other tables
    // depend on users (via user_id foreign key)
    await queryInterface.createTable('users', {

      user_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,  // 1, 2, 3... auto generated
        allowNull: false
      },

      username: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true  // No two teachers can have same username
      },

      email: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true  // No two teachers can have same email
      },

      password_hash: {
        type: Sequelize.STRING(255),
        allowNull: false
        // bcrypt hashes are stored here, NEVER plain text
      },

      full_name: {
        type: Sequelize.STRING(100),
        allowNull: true   // Optional - teacher can skip this
      },

      role: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'teacher'
        // Either 'teacher' or 'admin'
      },

      // Sequelize auto-manages these with timestamps: true
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

    // Add index on username for fast login lookups
    await queryInterface.addIndex('users', ['username'], {
      name: 'idx_users_username'
    });

    // Add index on email for fast email lookups
    await queryInterface.addIndex('users', ['email'], {
      name: 'idx_users_email'
    });
  },

  async down(queryInterface, Sequelize) {
    // This runs when we undo the migration
    // Simply drop the table (removes everything)
    await queryInterface.dropTable('users');
  }
};