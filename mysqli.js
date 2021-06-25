let mysql = require('mysql');
const core = require(`./core`);

var powdb, gamedb, logindb;

let date = new Date();
let current_date = date_normal(date);
console.log(`start-billing ${current_date}`);

function openpdbConn() {
    powdb = mysql.createConnection({
        host     : core.pow.host,
        user     : core.pow.user,
        password : core.pow.password,
        database : core.pow.database
    })

    powdb.connect();
    global.gdbConn = powdb;
    
}
function opengdbConn() {
    gamedb = mysql.createConnection({
        host     : core.game.host,
        user     : core.game.user,
        password : core.game.password,
        database : core.game.database
    })

    gamedb.connect();
    global.gdbConn = gamedb;
    
}
function openldbConn() {

    logindb = mysql.createConnection({
        host     : core.login.host,
        user     : core.login.user,
        password : core.login.password,
        database : core.login.database
    })
    
    logindb.connect();
    global.ldbConn = logindb;

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

module.exports = {
    async game_query(sql) {
        opengdbConn();
        return await new Promise((resolve, reject) => {

            gamedb.query(sql, (error, results, fields) =>{

                if (error) return reject(error);
                return resolve(results);

            });
            gamedb.end();
        })
        .then(res => res)
        .catch((error) => {
            throw error;
        });

    },
    async pow_query(sql) {
        openpdbConn();
        return await new Promise((resolve, reject) => {

            powdb.query(sql, (error, results, fields) =>{

                if (error) return reject(error);
                return resolve(results);

            });
            powdb.end();
            
        })
        .then(res => res)
        .catch((error) => {
            throw error;
        });

    },
    async login_query(sql) {
        openldbConn();
        return await new Promise((resolve, reject) => {

            logindb.query(sql, (error, results, fields) =>{

                if (error) return reject(error);
                return resolve(results);

            });
            logindb.end();
            
        })
        .then(res => res)
        .catch((error) => {
            throw error;
        });

    }
};
