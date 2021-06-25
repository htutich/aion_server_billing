/* eslint-disable no-console */
const http = require(`http`);
const url = require(`url`);
const post = require(`querystring`);
const formidable = require("formidable");
const mysqli = require(`./mysqli`);

const fail = resp => new Object({ success: false, message: resp });
const success = resp => new Object({ success: true, response: resp });


const model = {
    token: require(`./controller/token/token`),
    kinah: require(`./controller/kinah/kinah`),
    user: require(`./controller/user/user`)
}


var cluster = require('cluster');
var numCPUs = 8;

if (cluster.isMaster) {
    for (var i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
} else {
    http
    .createServer(async function (req, res) {
            console.time(`e`);
            const parts = url.parse(req.url, true);
            const query = parts.query;
            var [module, target, action] = parts.pathname.split(`/`).splice(1, 3);
            if (action == undefined) action = `main`;
            if (module == `help`) return writeHelp(res);
            if (await model[module] == undefined) return sendResponse(fail(`module not found`), res);
            if (await model[module][req.method] == undefined) return sendResponse(fail(`method not found`), res);
            if (await model[module][req.method][action] == undefined) return sendResponse(fail(`action not found`), res);
            
            
            let form = new formidable.IncomingForm();
            form.encoding = 'utf-8';
            form.maxFieldsSize = 2 * 1024 * 1024;

            form.uploadDir = "../upload_temp";
            let upfile =  new Promise((resolve, reject) => {
                form.parse(req, (err, fields, files) => {
                    if (err) reject(err);
                    else resolve(files); 
                });
            }).then(async results => await results )
            
            var ip = req.headers['x-forwarded-for'] || 
            req.connection.remoteAddress || 
            req.socket.remoteAddress ||
            (req.connection.socket ? req.connection.socket.remoteAddress : null);

            let body = ``;
            req
                .on(`data`, chunk => { body += chunk.toString(); })
                .on(`end`, () => {
                    Object.assign(query, post.parse(body));
                    query.ip = ip;
                    model[module][req.method][action](query, target, upfile)
                        .then(async response => {
                            if (response.result) {
                                return unitpayResponse(await response, res)
                            } else {
                                return sendResponse(success(await response), res)

                            }
                        })
                        .catch(err => sendResponse(fail(err.toString()), res));
                });

            

            let date = new Date();
            let current_date = date_normal(date);
            console.log(`\n` + module + ` ` + action + `\n` + current_date);
            console.timeEnd(`e`);

            await secure_worker()
            setInterval(async () => { await secure_worker() }, 60000);

    })
    .listen(3000);
}
function date_normal(date) {
    return (date.getDate() < 10 ? '0' + date.getDate() : date.getDate()) + `.` +
    ((date.getMonth() + 1) < 10 ? '0' + (date.getMonth() + 1) : (date.getMonth() + 1)) + `.`+
    date.getFullYear() + ` `+
    (date.getHours()<10?`0`+date.getHours():date.getHours()) + `:`+
    (date.getMinutes()<10?`0`+date.getMinutes():date.getMinutes()) + `:`+
    (date.getSeconds()<10?`0`+date.getSeconds():date.getSeconds()) + `.`+
    (date.getMilliseconds()<10?`0`+date.getMilliseconds():date.getMilliseconds());
}
var sendResponse = function (object, res) {
    res.setHeader(`Content-Type`, `application/json; charset=UTF-8`);
    res.setHeader(`Access-Control-Allow-Origin`, `*`);
    res.setHeader(`Access-Control-Allow-Methods`, `*`);
    let resp = JSON.stringify(object, null, 2);
    res.write(resp);
    res.end();
    return true;
};

var unitpayResponse = function (object, res) {
    res.setHeader(`Content-Type`, `application/json; charset=UTF-8`);
    res.setHeader(`Access-Control-Allow-Origin`, `*`);
    res.setHeader(`Access-Control-Allow-Methods`, `*`);
    let resp = JSON.stringify(object, null, 2);
    res.write(resp);
    res.end();
    return true;
};



const writeHelp = (res) => {
    let help_list = ``;
    let models = model;
    for (let model in models) {
        help_list += `<h1>${model}</h1>`;
        for (let method in models[model]) {
            help_list += `<h2>${method}</h2>`;
            for (let action in models[model][method]) {
                if (action == `main`) {
                    action = ``;
                }
                help_list += `<div>${model}/@id/${action}</div>`;
            }
        }
        help_list += `<hr>`;
    }
    res.write(help_list);
    res.end();
};


const secure_worker = async () => {
    let secure_workerls = await mysqli.login_query(`SELECT * FROM secure_worker WHERE timest < NOW() - INTERVAL 10 MINUTE `);

    for (let key in secure_workerls) {
        if (secure_workerls.hasOwnProperty(key)) {
            let el = secure_workerls[key];

            await mysqli.login_query( `DELETE FROM secure_worker WHERE acc_id = '${el.acc_id}'` );
            await mysqli.login_query( `UPDATE account_data SET login_log = '1', hdd_control = '1' WHERE id = '${el.acc_id}'` );
        }
    }
}

