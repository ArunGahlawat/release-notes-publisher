var express = require('express');
var router = express.Router();

/* Phriction home page. */
router.get('/', function(req, res) {
  res.status(200);
  res.render('index', { title: 'Phriction Hook Processor'});
});

module.exports = router;
