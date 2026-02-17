// src/routes/auth.js

// Authentication routes handle user registration, login, and logout
// These are PUBLIC routes - no login required to access them
// (except logout which requires being logged in)

const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const { User } = require('../config/models');
const { redirectIfAuthenticated } = require('../middleware/auth');

// ==========================================
// GET /login
// Shows the login page
// If already logged in → redirect to dashboard
// ==========================================
router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('login', {
    title: 'Login - Paper Valuation',
    error: null   // No error on first visit
  });
});

// ==========================================
// POST /login
// Processes the login form submission
// Uses Passport to verify credentials
// ==========================================
router.post('/login',
  redirectIfAuthenticated,
  passport.authenticate('local', {
    failureRedirect: '/login',
    failureFlash: true          // ← CHANGE TO THIS
  }),
  
  // Only reaches here if login SUCCESSFUL
  (req, res) => {
    console.log(`✅ User logged in: ${req.user.username}`);

    // Check if user was trying to visit a specific page before login
    // e.g. they tried /upload-individual, got redirected to login,
    // now after login we send them to /upload-individual
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;  // Clean up

    res.redirect(returnTo);
  }
);

// ==========================================
// GET /register
// Shows the registration page
// If already logged in → redirect to dashboard
// ==========================================
router.get('/register', redirectIfAuthenticated, (req, res) => {
  res.render('register', {
    title: 'Register - Paper Valuation',
    error: null
  });
});

// ==========================================
// POST /register
// Processes the registration form
// Creates new user account
// ==========================================
router.post('/register', redirectIfAuthenticated, async (req, res) => {

  // Extract form data
  const { username, email, password, confirm_password, full_name } = req.body;

  try {
    // ── VALIDATION ──────────────────────────────

    // Check all required fields are filled
    if (!username || !email || !password) {
      return res.render('register', {
        title: 'Register - Paper Valuation',
        error: 'Username, email, and password are required'
      });
    }

    // Check passwords match
    if (password !== confirm_password) {
      return res.render('register', {
        title: 'Register - Paper Valuation',
        error: 'Passwords do not match'
      });
    }

    // Check password length
    if (password.length < 8) {
      return res.render('register', {
        title: 'Register - Paper Valuation',
        error: 'Password must be at least 8 characters'
      });
    }

    // ── CREATE USER ──────────────────────────────

    // Create user in database
    // Note: password_hash is empty for now, we set it below
    const newUser = await User.create({
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      full_name: full_name ? full_name.trim() : null,
      password_hash: 'temporary', // Will be replaced immediately below
      role: 'teacher'
    });

    // Hash and set the real password
    // We do this separately because setPassword() is a model method
    await newUser.setPassword(password);
    await newUser.save();

    console.log(`✅ New user registered: ${newUser.username}`);

    // ── AUTO LOGIN AFTER REGISTRATION ──────────────
    // Log the user in automatically after registering
    // Better UX than making them login right after registering!
    req.login(newUser, (err) => {
      if (err) {
        console.error('Auto-login after registration failed:', err);
        return res.redirect('/login');
      }
      // Redirect to dashboard
      res.redirect('/');
    });

  } catch (error) {
    console.error('Registration error:', error.message);

    // Handle specific database errors with friendly messages
    let errorMessage = 'Registration failed. Please try again.';

    if (error.name === 'SequelizeUniqueConstraintError') {
      // Check which field caused the duplicate error
      const field = error.errors[0]?.path;
      if (field === 'username') {
        errorMessage = 'Username already taken. Please choose another.';
      } else if (field === 'email') {
        errorMessage = 'Email already registered. Try logging in instead.';
      }
    } else if (error.name === 'SequelizeValidationError') {
      // Model validation failed (e.g. invalid email format)
      errorMessage = error.errors[0]?.message || errorMessage;
    }

    res.render('register', {
      title: 'Register - Paper Valuation',
      error: errorMessage
    });
  }
});

// ==========================================
// POST /logout
// Logs out the current user
// Destroys their session
// ==========================================
router.post('/logout', (req, res) => {
  const username = req.user?.username || 'Unknown';

  // req.logout() is provided by Passport
  // It removes the user from the session
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }

    // Destroy the entire session from PostgreSQL
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
      }
      console.log(`✅ User logged out: ${username}`);

      // Redirect to login page
      res.redirect('/login');
    });
  });
});

module.exports = router;
