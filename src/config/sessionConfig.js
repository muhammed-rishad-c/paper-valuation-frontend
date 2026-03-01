
require('dotenv').config();
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');


const pgPool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD
});

// Test the pool connection
pgPool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Session store connection failed:', err.message);
  } else {
    console.log('✅ Session store connected to PostgreSQL');
    release();
  }
});

const sessionConfig = {

  
  store: new pgSession({
    pool: pgPool,              
    tableName: 'sessions',     
    createTableIfMissing: true 
  }),


  secret: process.env.SESSION_SECRET,

  resave: false,

  saveUninitialized: false,

  cookie: {

    maxAge: 7 * 24 * 60 * 60 * 1000,

    httpOnly: true,

    secure: process.env.NODE_ENV === 'production',

    sameSite: 'strict'
  }
};

module.exports = sessionConfig;
