'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class StudentAnswer extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  StudentAnswer.init({
    submission_id: DataTypes.INTEGER,
    question_number: DataTypes.INTEGER,
    answer_text: DataTypes.TEXT,
    marks_obtained: DataTypes.DECIMAL,
    is_or_question: DataTypes.BOOLEAN,
    or_option_chosen: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'StudentAnswer',
  });
  return StudentAnswer;
};