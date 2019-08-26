var express = require('express');
var router = express.Router();
const request = require("superagent");
var config = require('../../config');
var mysql = require('mysql');
var moment = require('moment');
var MailConfig = require('../../email');
var smtpTransport = MailConfig.SMTPTransport;
var connection = mysql.createConnection({
  host : config.mysql.host,
  port : config.mysql.port,
  user : config.mysql.user,
  password : config.mysql.pass
});

const phabricatorHost = config.phabricator.host;
const phabricatorApiToken = config.phabricator.apiToken;
const archiveProjectQuery = config.query.projects.archived;

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
  console.log("phabricatorToken: ",phabricatorToken);
  console.log("contentType: ",contentType);
  console.log("trigger type: ",triggerType);
  console.log("trigger phid: ",projectPHID);
  console.log("trigger time: ",triggerTime);
  console.log("is test: ",isTest);
  var archivedProjectDetails;
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
              if (response.status === 200 && response.type === 'application/json') {
                if(response.body.result.data[0]) {
                  console.log("=========================== Archived project details =========================== ");
                  console.log(response.body.result.data[0]);
                  console.log("============================================================================");
                  archivedProjectDetails=response.body.result.data[0];
                  var isSendReleaseNotes = archivedProjectDetails.fields['custom.rivigo:send-release-notes'];
                  var projectName = archivedProjectDetails.fields['name'];
                  var recipientEmails = [];
                  var recipientNames = [];
                  if (isSendReleaseNotes) {
                    var releaseNoteRecipientsPHID = archivedProjectDetails.fields['custom.rivigo:release-notes-recipients'];
                    if (releaseNoteRecipientsPHID && releaseNoteRecipientsPHID.length > 0) {
                      var releaseNoteRecipients = "'"+releaseNoteRecipientsPHID.join("','")+"'";
                      console.log("Recipients: ",releaseNoteRecipients);
                      var query = config.mysql.queries.getUserEmail.replace('_KEY1_',releaseNoteRecipients);
                      connection.query(query, function (error, result, fields) {
                        if (error)
                            throw error;
                        console.log("Result: ", result.length);
                        if (result.length !== releaseNoteRecipientsPHID.length) {
                            console.log("Email count and recipients count is not same ")
                        }
                        for (var i = 0; i < result.length; i++) {
                            recipientEmails.push(result[i].address.toString());
                            recipientNames.push(result[i].realName.toString());
                        }
                        console.log("recipientEmails.length:",recipientEmails.length," recipientNames.length:",recipientNames.length);
                        if (recipientEmails.length > 0 && recipientNames.length > 0) {
                          var currentTime = moment().format('dddd, MMM Do YYYY').toString();
                          let mailOptions = {
                            from: config.mail.helperOptions.from,
                            to: recipientEmails.join(","),
                            subject: config.mail.helperOptions.subject.replace("_KEY1_", projectName).replace("_KEY2_", currentTime),
                            text:"this is text body",
                            html:"Hi "+recipientNames.join(", ")+"<br><br>Below are the release notes for <strong>"+projectName+"</strong><br><br>Test release notes",
                          };
                          smtpTransport.verify((error,success) => {
                            if (error) {
                              console.error("Error verifying email: ", error);
                              res.status(200).write("Ok");
                              res.end();
                            } else {
                              console.log("Email verification successful");
                              smtpTransport.sendMail(mailOptions,(error,info) => {
                                if (error) {
                                  console.error("Error sending email: ", error);
                                  res.status(200).write("Ok");
                                  res.end();
                                }
                              });
                            }
                          });
                        }
                      });
                      connection.end(function(err) {
                        if (err)
                          throw err;
                        console.log("Disconnected")
                      });
                    }
                  }
                }
                else {
                  console.log("Archived project not found");
                }
              }
              res.end();
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
