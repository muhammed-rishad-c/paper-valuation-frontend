// src/config/passport.js

// Passport.js is our authentication middleware
// It handles the "who are you?" question for every request
// We use LocalStrategy which means username + password (not Google/Facebook login)

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;

// We require models inside the function to avoid circular dependency issues
// (passport.js is loaded before models sometimes)

// ==========================================
// LOCAL STRATEGY
// This defines HOW to verify a login attempt
// Called every time someone tries to login
// ==========================================
passport.use(new LocalStrategy(
  {
    // Tell passport which form fields to use
    // Our login form uses "username" and "password" fields
    usernameField: 'username',
    passwordField: 'password'
  },
  async (username, password, done) => {
    // "done" is a callback function:
    // done(error) → something went wrong (server error)
    // done(null, false, message) → login failed (wrong credentials)
    // done(null, user) → login successful!

    try {
      // Lazy require to avoid circular dependencies
      const { User } = require('./models');

      // Step 1: Find user by username in database
      // We convert to lowercase so login is case-insensitive
      // "John" and "john" will find the same account
      const user = await User.findOne({
        where: { username: username.toLowerCase().trim() }
      });

      // Step 2: Check if user exists
      if (!user) {
        // We give a vague message on purpose
        // Don't say "username not found" - that helps hackers!
        // Instead say generic "incorrect credentials"
        return done(null, false, {
          message: 'Incorrect username or password'
        });
      }

      // Step 3: Check if password is correct
      // verifyPassword() uses bcrypt to compare
      // bcrypt automatically handles the hashing comparison
      const isPasswordValid = await user.verifyPassword(password);

      if (!isPasswordValid) {
        return done(null, false, {
          message: 'Incorrect username or password'
        });
      }

      // Step 4: Everything is correct! Return the user
      // Passport will now call serializeUser below
      console.log(`✅ Login successful: ${user.username}`);
      return done(null, user);

    } catch (error) {
      // Something went wrong with database etc
      console.error('❌ Passport error:', error.message);
      return done(error);
    }
  }
));

// ==========================================
// SERIALIZE USER
// Called after successful login
// Decides what to store in the session
// We only store user_id (small and secure)
// ==========================================
passport.serializeUser((user, done) => {
  // Store only user_id in session
  // We don't store full user object - that would be too big
  // and would go stale if user updates their profile
  done(null, user.user_id);
});

// ==========================================
// DESERIALIZE USER
// Called on EVERY request when user is logged in
// Takes user_id from session → loads full user from database
// This is how req.user gets populated on every request
// ==========================================
passport.deserializeUser(async (user_id, done) => {
  try {
    const { User } = require('./models');

    // Load user from database using stored user_id
    // We don't load password_hash - no need to send it everywhere
    const user = await User.findByPk(user_id, {
      attributes: [
        'user_id',
        'username',
        'email',
        'full_name',
        'role',
        'created_at'
      ]
    });

    if (!user) {
      // User was deleted after session was created
      return done(null, false);
    }

    // user is now available as req.user in all routes!
    done(null, user);

  } catch (error) {
    console.error('❌ Deserialize error:', error.message);
    done(error);
  }
});

module.exports = passport;
