var express = require('express');
var router = express.Router();
const request = require("superagent");
const phabricatorHost = 'http://phabricator.local/api/';
const phabricatorApiToken = 'api-cw5sy7lyjylumki67rhnjaumqq2w';
const archiveProjectQuery = 'ftbNds4RNmg1';



/* Projects home page. */
router.get('/', function(req, res) {
  res.status(200);
  res.render('index', { title: 'Projects Hook Processor'});
});

router.post('/', function(req, res) {
  const phabricatorToken = req.get('x-phabricator-webhook-signature');
  const contentType = req.get('content-type');
  const triggerType = req.body.object.type;
  const projectPHID = req.body.object.phid;
  const triggerTime = req.body.action.epoch;
  const isTest = req.body.action.test;
  console.log("=========================== Raw Request =============================");
  console.log(req.body);
  console.log("============================================================================");
  console.log("phabricatorToken: ", phabricatorToken);
  console.log("contentType: ", contentType);
  console.log("trigger type: ",triggerType);
  console.log("trigger phid: ",projectPHID);
  console.log("trigger time: ",triggerTime);
  console.log("is test: ",isTest);
  var archivedProjectDetails;
  console.log("============================================================================");
  if(contentType !== 'application/json' || triggerType !== 'PROJ' || isTest !== false || !phabricatorToken || !projectPHID || !triggerTime ) {
    res.status(400).write("Invalid trigger endpoint");
    console.log("Invalid payload received");
  } else {
    if (!(projectPHID && projectPHID.length > 9 && projectPHID.substring(0,9) === 'PHID-PROJ'))
      res.status(400).write("Invalid request data");

    request
        .post(
            phabricatorHost+'project.search'
        )
        .set("Content-Type", "application/x-www-form-urlencoded")
        .send({
          'api.token': `${phabricatorApiToken}`,
          'constraints[phids][0]': `${projectPHID}`,
          'queryKey': `${archiveProjectQuery}`
        })
        .then(
            response => {
              res.status(200).write("Ok");
              res.end();
              if (response.status === 200 && response.type === 'application/json') {
                console.log("=========================== Raw Response =============================");
                console.log(response.body.result);
                console.log("============================================================================");
                if(response.body.result.data[0]) {
                  console.log("Valid project. Details:", response.body.result.data[0]);
                  archivedProjectDetails=response.body.result.data[0];
                }
                else {
                  console.log("Archived project not found");
                }
              }
            },
            (error) => {
              console.log(error);
              res.status(200).write("Ok");
              res.end();
            }
        );
  }
});

module.exports = router;
