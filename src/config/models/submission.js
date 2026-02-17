'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Submission extends Model {
    static associate(models) {
      Submission.belongsTo(models.Exam, {
        foreignKey: 'exam_id',
        as: 'exam'
      });

      Submission.hasMany(models.StudentAnswer, {
        foreignKey: 'submission_id',
        as: 'answers',
        onDelete: 'CASCADE'
      });
    }
  }

  Submission.init({
    submission_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    exam_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      references: {
        model: 'exams',
        key: 'exam_id'
      }
    },
    roll_no: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    student_name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    valuation_status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'completed', 'error']]
      }
    },
    total_marks_obtained: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true
    },
    percentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      validate: { min: 0, max: 100 }
    }
  }, {
    sequelize,
    modelName: 'Submission',
    tableName: 'submissions',
    timestamps: true,
    underscored: true
  });

  return Submission;
};