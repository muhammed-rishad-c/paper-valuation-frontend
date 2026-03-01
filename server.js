const express = require('express');
const path = require('path');
require('dotenv').config();

const session = require('express-session');
const flash = require('connect-flash');
const passport = require('./src/config/passport');
const sessionConfig = require('./src/config/sessionConfig');

const app = express();
const PORT = process.env.PORT || 3000;


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));


app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


app.use(express.static(path.join(__dirname, 'src/public')));


app.use(session(sessionConfig));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());


app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.messages = {
    error: req.flash('error'),
    success: req.flash('success')
  };
  next();
});


const authRoutes = require('./src/routes/auth');
const indexRoutes = require('./src/routes/index');
app.use('/', authRoutes);
app.use('/', indexRoutes);


app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    title: 'Error',
    message: 'Something broke!'
  });
});


app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`✅ Python API at ${process.env.PYTHON_API_URL}`);
});