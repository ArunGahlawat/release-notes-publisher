let nodemailer = require('nodemailer');
var config = require('config').mail.SMTP;

module.exports.SMTPTransport = nodemailer.createTransport({
    host: config.HOST,
    port: config.port,
    secure: config.SECURE, // upgrade later with STARTTLS
    debug: true,
    auth: {
        user: config.USER_NAME,
        pass: config.PASSWORD
    }
});

module.exports.ViewOption = (transport, hbs) => {
    transport.use('compile', hbs({
        viewPath: 'views/email',
        extName: '.hbs'
    }));
};
