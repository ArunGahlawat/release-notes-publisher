var express = require('express');
var router = express.Router();

/* Maniphest home page. */
router.get('/', function(req, res) {
  res.status(200);
  res.render('index', { title: 'Maniphest Hook Processor'});
});

module.exports = router;
