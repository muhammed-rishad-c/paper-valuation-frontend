'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Exam extends Model {
    static associate(models) {
      Exam.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'owner'
      });

      Exam.hasMany(models.Question, {
        foreignKey: 'exam_id',
        as: 'questions',
        onDelete: 'CASCADE'
      });

      Exam.hasMany(models.OrGroup, {
        foreignKey: 'exam_id',
        as: 'or_groups',
        onDelete: 'CASCADE'
      });

      Exam.hasMany(models.Submission, {
        foreignKey: 'exam_id',
        as: 'submissions',
        onDelete: 'CASCADE'
      });
    }
  }

  Exam.init({
    exam_id: {
      type: DataTypes.STRING(100),
      primaryKey: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'user_id'
      }
    },
    exam_name: {
      type: DataTypes.STRING(200),
      allowNull: false,
      validate: {
        len: { args: [3, 200], msg: 'Exam name must be 3-200 characters' }
      }
    },
    class: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    subject: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    total_marks: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: { args: 1, msg: 'Total marks must be at least 1' }
      }
    }
  }, {
    sequelize,
    modelName: 'Exam',
    tableName: 'exams',
    timestamps: true,
    underscored: true
  });

  return Exam;
};