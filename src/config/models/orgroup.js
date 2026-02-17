'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OrGroup extends Model {
    static associate(models) {
      OrGroup.belongsTo(models.Exam, {
        foreignKey: 'exam_id',
        as: 'exam'
      });
    }
  }

  OrGroup.init({
    or_group_id: {
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
    group_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [['single', 'pair']]
      }
    },
    option_a: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    option_b: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'OrGroup',
    tableName: 'or_groups',
    timestamps: true,
    underscored: true
  });

  return OrGroup;
};