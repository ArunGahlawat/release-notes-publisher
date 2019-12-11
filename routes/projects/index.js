var express = require('express');
var router = express.Router();
const request = require("superagent");
var config = require('../../config');
var mysql = require('mysql');
var moment = require('moment');
var MailConfig = require('../../email');
var smtpTransport = MailConfig.SMTPTransport;
var pool = mysql.createPool({
  connectionLimit : 10,
  host : config.mysql.host,
  port : config.mysql.port,
  user : config.mysql.user,
  password : config.mysql.pass,
  database : config.mysql.database
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
  if(contentType !== 'application/json' || triggerType !== 'PROJ' || isTest !== false || !phabricatorToken
      || !projectPHID || !triggerTime
      || (!(projectPHID && projectPHID.length > 9 && projectPHID.substring(0,9) === 'PHID-PROJ'))) {
    res.status(400).write("Invalid trigger endpoint");
    console.log("Invalid payload received");
  } else {
    request
        .post(
            phabricatorHost+'api/project.search'
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
                  let taskOwners = new Map();
                  if (isSendReleaseNotes) {
                    request
                        .post(
                            phabricatorHost+'api/maniphest.search'
                        )
                        .set("Content-Type", "application/x-www-form-urlencoded")
                        .send({
                          'api.token': `${phabricatorApiToken}`,
                          'constraints[projects][0]': `${archivedProjectDetails.phid}`,
                          'constraints[statuses][0]': 'closed'
                        })
                        .then(
                            maniphestResponse => {
                              if (maniphestResponse.status === 200 && maniphestResponse.type === 'application/json') {
                                if (maniphestResponse.body.result.data) {
                                  console.log("=========================== Task Details =========================== ");
                                  console.log(maniphestResponse.body.result.data);
                                  console.log("============================================================================");
                                  var maniphestTasksLength = maniphestResponse.body.result.data.length;
                                  var releaseNotesList = [];
                                  let taskOwnerPHIDList = new Set();
                                  for (var mti = 0; mti < maniphestTasksLength; mti++) {
                                    var taskDetails = maniphestResponse.body.result.data[mti];
                                    var taskType = taskDetails.fields['subtype'];
                                    var ownerPHID = taskDetails.fields['ownerPHID'];
                                    if (taskType.toUpperCase() !== "BUG" && ownerPHID && ownerPHID.toString() !== 'null' && ownerPHID.length > 9 && ownerPHID.substring(0,9) === 'PHID-USER') {
                                      taskOwnerPHIDList.add("'" + ownerPHID + "'");
                                    }
                                  }
                                  var ownerQuery = config.mysql.queries.getUserEmail.replace('_KEY1_', Array.from(taskOwnerPHIDList).join(","));
                                  pool.query(ownerQuery, function (error, result, fields) {
                                    console.log("result: ",result,"taskOwnerPhidlist",taskOwnerPHIDList);
                                    if (error || result.length !== taskOwnerPHIDList.size)
                                      console.log("Error occurred while querying db:", error);
                                    else {
                                      for (var i = 0; i < result.length; i++) {
                                        if (!taskOwners.has(result[i].phid.toString()))
                                          taskOwners.set(result[i].phid.toString(), result[i].realName.toString());
                                      }
                                      for (mti = 0; mti < maniphestTasksLength; mti++) {
                                        var htmlTaskCounter = 0;
                                        var taskDetails = maniphestResponse.body.result.data[mti];
                                        var taskId = "T" + taskDetails.id.toString();
                                        var taskUrl = phabricatorHost + taskId;
                                        var taskType = taskDetails.fields['subtype'];
                                        var ownerPHID = taskDetails.fields['ownerPHID'];
                                        var ownerRealName;
                                        if (!ownerPHID || ownerPHID.toString() === '' || ownerPHID.toString() === 'null' || !taskOwners.has(ownerPHID.toString()))
                                          ownerRealName = 'Unassigned';
                                        else
                                          ownerRealName = taskOwners.get(ownerPHID.toString());
                                        if (taskType.toUpperCase() === "DEFAULT")
                                          taskType = "Tech Support";
                                        var taskTitle = taskDetails.fields['name'];
                                        var releaseNotesFieldData = taskDetails.fields['custom.rivigo:release-notes'];
                                        if (!releaseNotesFieldData || releaseNotesFieldData === 'null')
                                          releaseNotesFieldData = "";
                                        var releaseNotesIndent = "&nbsp;&nbsp;&nbsp;&nbsp;";
                                        if (htmlTaskCounter >= 9)
                                          releaseNotesIndent += "&nbsp;";
                                        var taskReleaseNotes = releaseNotesIndent + releaseNotesFieldData;
                                        if (taskReleaseNotes) {
                                          taskReleaseNotes = taskReleaseNotes.replace(/\*\*\n/g, "</b><br>&nbsp;&nbsp;&nbsp;&nbsp;");
                                          taskReleaseNotes = taskReleaseNotes.replace(/\*\*\s/g, "</b> ");
                                          taskReleaseNotes = taskReleaseNotes.replace(/\*\*/g, "<b> ");
                                          taskReleaseNotes = taskReleaseNotes.replace(/\n/g, "<br>&nbsp;&nbsp;&nbsp;&nbsp;");
                                          taskReleaseNotes = taskReleaseNotes.replace(/\s\s/g, "&nbsp;&nbsp;");
                                        }
                                        if (taskType.toUpperCase() !== "BUG") {
                                          htmlTaskCounter++;
                                          var taskHtml = `<b>${htmlTaskCounter}. <a href="${taskUrl}">${taskId}</a> - ${taskTitle} - (${taskType.toUpperCase()}) - ${ownerRealName}</b><br>`;
                                          taskHtml += taskReleaseNotes;
                                          releaseNotesList.push(taskHtml);
                                        }
                                      }
                                      var releaseNoteRecipientsPHID = archivedProjectDetails.fields['custom.rivigo:release-notes-recipients'];
                                      if (releaseNoteRecipientsPHID && releaseNoteRecipientsPHID.length > 0) {
                                        var releaseNoteRecipients = "'" + releaseNoteRecipientsPHID.join("','") + "'";
                                        console.log("Recipients: ", releaseNoteRecipients);
                                        var query = config.mysql.queries.getUserEmail.replace('_KEY1_', releaseNoteRecipients);
                                        pool.query(query, function (error, result, fields) {
                                          if (error)
                                            console.log("Error occurred while querying db:", error);
                                          else {
                                            console.log("Result: ", result.length);
                                            if (result.length !== releaseNoteRecipientsPHID.length) {
                                              console.log("Email count and recipients count is not same ")
                                            }
                                            for (var i = 0; i < result.length; i++) {
                                              recipientEmails.push(result[i].address.toString());
                                              recipientNames.push(result[i].realName.toString());
                                            }
                                            console.log("recipientEmails.length:", recipientEmails.length, " recipientNames.length:", recipientNames.length);
                                            if (recipientEmails.length > 0 && recipientNames.length > 0) {
                                              var currentTime = moment().format('dddd, MMM Do YYYY').toString();
                                              let mailOptions = {
                                                from: config.mail.helperOptions.from,
                                                to: recipientEmails.join(","),
                                                subject: config.mail.helperOptions.subject.replace("_KEY1_", projectName).replace("_KEY2_", currentTime),
                                                text: "this is text body",
                                                html: releaseNotesList.join("<br><br>"),
                                              };
                                              smtpTransport.verify((error, success) => {
                                                if (error) {
                                                  console.log("Error verifying email: ", error);
                                                  res.status(200).write("Ok");
                                                  res.end();
                                                } else {
                                                  console.log("Email verification successful");
                                                  smtpTransport.sendMail(mailOptions, (error, info) => {
                                                    if (error) {
                                                      console.error("Error sending email: ", error);
                                                      res.status(200).write("Ok");
                                                      res.end();
                                                    }
                                                  });
                                                }
                                              });
                                            }
                                          }
                                        });
                                      }
                                    }
                                  });
                                }
                              }
                              },
                            (error) => {
                              console.log(error);
                              res.status(200).write("Ok");
                              res.end();
                            });
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
