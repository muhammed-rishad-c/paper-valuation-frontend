require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.PG_DATABASE,
  process.env.PG_USER,
  process.env.PG_PASSWORD,
  {
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    dialect: 'postgres',
    logging: false
  }
);

async function testConnection() {
  try {
    await sequelize.authenticate();

    await sequelize.close();
  } catch (error) {
    console.error('❌ Database connection failed:');
    console.error('   Error:', error.message);
    console.error('\n💡 Check:');
    console.error('   1. PostgreSQL is running');
    console.error('   2. Database "paper_valuation_db" exists');
    console.error('   3. .env credentials are correct');
    console.error('   4. PostgreSQL port is 5432 (default)');
    process.exit(1);
  }
}

testConnection();