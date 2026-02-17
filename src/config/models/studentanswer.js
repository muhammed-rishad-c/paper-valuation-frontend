'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StudentAnswer extends Model {
    static associate(models) {
      StudentAnswer.belongsTo(models.Submission, {
        foreignKey: 'submission_id',
        as: 'submission'
      });
    }
  }

  StudentAnswer.init({
    answer_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    submission_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'submissions',
        key: 'submission_id'
      }
    },
    question_number: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    answer_text: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    marks_obtained: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true
    },
    is_or_question: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    or_option_chosen: {
      type: DataTypes.STRING(10),
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'StudentAnswer',
    tableName: 'student_answers',
    timestamps: true,
    underscored: true
  });

  return StudentAnswer;
};