'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Submission extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Submission.init({
    exam_id: DataTypes.STRING,
    roll_no: DataTypes.STRING,
    student_name: DataTypes.STRING,
    valuation_status: DataTypes.STRING,
    total_marks_obtained: DataTypes.DECIMAL,
    percentage: DataTypes.DECIMAL
  }, {
    sequelize,
    modelName: 'Submission',
  });
  return Submission;
};