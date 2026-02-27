const express = require('express');
const path = require('path');
require('dotenv').config();

// Import auth packages in correct order
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('./src/config/passport');
const sessionConfig = require('./src/config/sessionConfig');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// VIEW ENGINE
// ==========================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

// ==========================================
// BODY PARSERS (FIRST)
// ==========================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
 
// ========================================== 
// STATIC FILES
// ==========================================
app.use(express.static(path.join(__dirname, 'src/public')));

// ==========================================
// SESSION + AUTH MIDDLEWARE (CORRECT ORDER!)
// ==========================================

// 1. Session ONCE ONLY
app.use(session(sessionConfig));

// 2. Flash messages
app.use(flash());
 
// 3. Initialize Passport ONCE ONLY
app.use(passport.initialize());

// 4. Passport sessions ONCE ONLY
app.use(passport.session());

// 5. Make user available in all templates (BEFORE routes!)
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.messages = {
    error: req.flash('error'),
    success: req.flash('success')
  };
  next();
});

// ==========================================
// ROUTES (AFTER MIDDLEWARE)
// ==========================================
const authRoutes = require('./src/routes/auth');
app.use('/', authRoutes);

const indexRoutes = require('./src/routes/index');
app.use('/', indexRoutes);

// ==========================================
// ERROR HANDLER (LAST)
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