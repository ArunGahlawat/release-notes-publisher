const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const path = require('path');
const createError = require('http-errors');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// Router Definition
const indexRouter = require('./routes/index');
const maniphestRouter = require('./routes/maniphest');
const projectsRouter = require('./routes/projects');
const phrictionRouter = require('./routes/phriction');

app.use('/', indexRouter);
app.use('/maniphest', maniphestRouter);
app.use('/projects', projectsRouter);
app.use('/phriction', phrictionRouter);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
