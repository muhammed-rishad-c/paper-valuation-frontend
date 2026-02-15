'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Exam extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Exam.init({
    exam_id: DataTypes.STRING,
    user_id: DataTypes.INTEGER,
    exam_name: DataTypes.STRING,
    class: DataTypes.STRING,
    subject: DataTypes.STRING,
    total_marks: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'Exam',
  });
  return Exam;
};