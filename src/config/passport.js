
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;


passport.use(new LocalStrategy(
  {

    usernameField: 'username',
    passwordField: 'password'
  },
  async (username, password, done) => {


    try {

      const { User } = require('./models');


      const user = await User.findOne({
        where: { username: username.toLowerCase().trim() }
      });


      if (!user) {

        return done(null, false, {
          message: 'Incorrect username or password'
        });
      }


      const isPasswordValid = await user.verifyPassword(password);

      if (!isPasswordValid) {
        return done(null, false, {
          message: 'Incorrect username or password'
        });
      }

      console.log(`✅ Login successful: ${user.username}`);
      return done(null, user);

    } catch (error) {

      console.error('❌ Passport error:', error.message);
      return done(error);
    }
  }
));


passport.serializeUser((user, done) => {

  done(null, user.user_id);
});


passport.deserializeUser(async (user_id, done) => {
  try {
    const { User } = require('./models');


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
      return done(null, false);
    }

    done(null, user);

  } catch (error) {
    console.error('❌ Deserialize error:', error.message);
    done(error);
  }
});

module.exports = passport;
