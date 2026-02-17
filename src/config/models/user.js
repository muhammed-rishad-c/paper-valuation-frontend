'use strict';
const { Model } = require('sequelize');
const bcrypt = require('bcrypt');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.hasMany(models.Exam, {
        foreignKey: 'user_id',
        as: 'exams',
        onDelete: 'CASCADE'
      });
    }

    async setPassword(password) {
      this.password_hash = await bcrypt.hash(password, 12);
    }

    async verifyPassword(password) {
      return await bcrypt.compare(password, this.password_hash);
    }
  }

  User.init({
    user_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: { msg: 'Username already exists' },
      validate: {
        len: { args: [3, 50], msg: 'Username must be 3-50 characters' },
        isAlphanumeric: { msg: 'Username must be alphanumeric' }
      }
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: { msg: 'Email already exists' },
      validate: {
        isEmail: { msg: 'Must be a valid email address' }
      }
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    full_name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    role: {
      type: DataTypes.STRING(20),
      defaultValue: 'teacher',
      validate: {
        isIn: {
          args: [['teacher', 'admin']],
          msg: 'Role must be teacher or admin'
        }
      }
    }
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    timestamps: true,
    underscored: true
  });

  return User;
};