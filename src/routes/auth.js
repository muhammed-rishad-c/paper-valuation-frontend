const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const { User } = require('../config/models');
const { redirectIfAuthenticated } = require('../middleware/auth');


router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('login', {
    title: 'Login - Paper Valuation',
    error: null
  });
});


router.post('/login',
  redirectIfAuthenticated,
  passport.authenticate('local', {
    failureRedirect: '/login',
    failureFlash: true
  }),
  (req, res) => {
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  }
);


router.get('/register', redirectIfAuthenticated, (req, res) => {
  res.render('register', {
    title: 'Register - Paper Valuation',
    error: null
  });
});


router.post('/register', redirectIfAuthenticated, async (req, res) => {
  const { username, email, password, confirm_password, full_name } = req.body;

  try {
    if (!username || !email || !password) {
      return res.render('register', {
        title: 'Register - Paper Valuation',
        error: 'Username, email, and password are required'
      });
    }

    if (password !== confirm_password) {
      return res.render('register', {
        title: 'Register - Paper Valuation',
        error: 'Passwords do not match'
      });
    }

    if (password.length < 8) {
      return res.render('register', {
        title: 'Register - Paper Valuation',
        error: 'Password must be at least 8 characters'
      });
    }

    const newUser = await User.create({
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      full_name: full_name ? full_name.trim() : null,
      password_hash: 'temporary',
      role: 'teacher'
    });

    await newUser.setPassword(password);
    await newUser.save();

    req.login(newUser, (err) => {
      if (err) {
        console.error('Auto-login failed:', err);
        return res.redirect('/login');
      }
      res.redirect('/');
    });

  } catch (error) {
    console.error('Registration error:', error.message);

    let errorMessage = 'Registration failed. Please try again.';

    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors[0]?.path;
      if (field === 'username') {
        errorMessage = 'Username already taken. Please choose another.';
      } else if (field === 'email') {
        errorMessage = 'Email already registered. Try logging in instead.';
      }
    } else if (error.name === 'SequelizeValidationError') {
      errorMessage = error.errors[0]?.message || errorMessage;
    }

    res.render('register', {
      title: 'Register - Paper Valuation',
      error: errorMessage
    });
  }
});


router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }

    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
      }
      res.redirect('/login');
    });
  });
});

module.exports = router;