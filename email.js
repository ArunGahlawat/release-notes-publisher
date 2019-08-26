let nodemailer = require('nodemailer');
var config = require('./config').mail.transporter.SMTP;

module.exports.SMTPTransport = nodemailer.createTransport({
    host: config.HOST,
    port: config.port,
    secure: config.SECURE, // upgrade later with STARTTLS
    debug: true,
    logger:true,
    auth: {
        user: config.USER_NAME,
        pass: config.PASSWORD
    }
});