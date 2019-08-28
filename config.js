if (process.env.MODE) {
    module.exports = require('./config/' + process.env.MODE + '.json');
} else {
    process.argv.forEach(function (val, index, array) {
        var arg = val.split("=");
        console.log("Got MODE=", process.env.MODE);
        if (arg.length > 0) {
            if (arg[0] === 'env') {
                module.exports = require('./config/' + arg[1] + '.json');
            }
        }
    });
}