

require('dotenv').config();
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');

// Create a PostgreSQL connection pool specifically for sessions
// We use a separate pool here instead of Sequelize
// because connect-pg-simple works better with raw pg Pool
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

// This is the complete session configuration
// It will be added to our Express app as middleware
const sessionConfig = {

  // Where to store sessions (PostgreSQL)
  store: new pgSession({
    pool: pgPool,              // Use our PostgreSQL pool
    tableName: 'sessions',     // Table name in database
    createTableIfMissing: true // Auto-create sessions table (very handy!)
  }),

  // Secret key used to sign the session cookie
  // MUST be a long random string - never expose this!
  // If someone knows this, they can forge session cookies
  secret: process.env.SESSION_SECRET,

  // resave: false means don't save session if nothing changed
  // This reduces unnecessary database writes
  resave: false,

  // saveUninitialized: false means don't create session until
  // something is stored in it (e.g. user logs in)
  // This prevents creating empty sessions for every visitor
  saveUninitialized: false,

  // Cookie settings - this is what gets sent to user's browser
  cookie: {
    // How long session lasts: 7 days in milliseconds
    maxAge: 7 * 24 * 60 * 60 * 1000,

    // httpOnly: true means JavaScript CANNOT read this cookie
    // This protects against XSS attacks (hackers injecting JS)
    httpOnly: true,

    // secure: true means cookie only sent over HTTPS
    // We only enable this in production (HTTPS required)
    // In development we use HTTP so this is false
    secure: process.env.NODE_ENV === 'production',

    // sameSite: 'strict' prevents CSRF attacks
    // Cookie only sent when navigating from same website
    sameSite: 'strict'
  }
};

module.exports = sessionConfig;
