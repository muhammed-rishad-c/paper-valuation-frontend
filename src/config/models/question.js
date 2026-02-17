'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Question extends Model {
    static associate(models) {
      Question.belongsTo(models.Exam, {
        foreignKey: 'exam_id',
        as: 'exam'
      });
    }
  }

  Question.init({
    question_id: {
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
    question_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 }
    },
    question_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: {
          args: [['short', 'long']],
          msg: 'Question type must be short or long'
        }
      }
    },
    max_marks: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 }
    },
    teacher_answer: {
      type: DataTypes.TEXT,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'Question',
    tableName: 'questions',
    timestamps: true,
    underscored: true
  });

  return Question;
};