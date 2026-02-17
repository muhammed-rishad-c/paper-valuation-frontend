const express = require('express');
const path = require('path');
require('dotenv').config();
const flash = require('connect-flash');
const session = require('express-session');
const passport = require('./src/config/passport');
const sessionConfig = require('./src/config/sessionConfig');

const app = express();
const PORT = process.env.PORT || 3000;  // ← Fallback to 3000 if not set

// ==========================================
// VIEW ENGINE SETUP
// ==========================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

// ==========================================
// BODY PARSERS
// Must be FIRST - parses incoming request data
// ==========================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==========================================
// STATIC FILES
// Serve CSS, JS, images from public folder
// ==========================================
app.use(express.static(path.join(__dirname, 'src/public')));

// ==========================================
// SESSION MIDDLEWARE
// Must come BEFORE passport
// Reads session cookie → loads session data
// ==========================================
app.use(session(sessionConfig));

app.use(session(sessionConfig));
app.use(flash());              // ← ADD THIS LINE
app.use(passport.initialize());
app.use(passport.session());

// ==========================================
// PASSPORT MIDDLEWARE
// Must come AFTER session
// ==========================================
app.use(passport.initialize());
app.use(passport.session());

// ==========================================
// MAKE USER AVAILABLE IN ALL EJS TEMPLATES
// Must come AFTER passport.session()
// Must come BEFORE routes
// ← THIS IS THE KEY FIX!
// ==========================================
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.messages = {           // ← ADD THIS
    error: req.flash('error'),      // ← Makes flash errors available in EJS
    success: req.flash('success')
  };
  next();
});


// ==========================================
// ROUTES
// Must come AFTER all middleware above
// ==========================================

// Auth routes (login, register, logout) - PUBLIC
const authRoutes = require('./src/routes/auth');
app.use('/', authRoutes);

// Main app routes - PROTECTED
const indexRoutes = require('./src/routes/index');
app.use('/', indexRoutes);

// ==========================================
// ERROR HANDLER
// Must be LAST
// ==========================================
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    title: 'Error',
    message: 'Something broke!'
  });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`✅ Python API at ${process.env.PYTHON_API_URL}`);
});