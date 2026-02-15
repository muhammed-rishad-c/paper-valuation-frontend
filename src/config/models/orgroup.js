'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class OrGroup extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  OrGroup.init({
    exam_id: DataTypes.STRING,
    group_type: DataTypes.STRING,
    option_a: DataTypes.TEXT,
    option_b: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'OrGroup',
  });
  return OrGroup;
};