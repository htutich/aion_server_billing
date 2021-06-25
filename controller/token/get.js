var crypto = require(`crypto`);
var reCAPTCHA = require('recaptcha2');
const mysqli = require(`../../mysqli`);
const core = require(`../../core`);

module.exports = {
    async main(query/*, target*/) {
        let data = query.password;
        return createToken(query.login, query.password, undefined, undefined, query.recaptchatoken);
    },
    async cToken(login, password){
        return createToken(login, password);
    }

};

var getUserByAuth = async (login, password) => {

    let hash_password;
    hash_password = crypto.createHash('sha1').update(password).digest("base64");
    let sql_gdb = ` SELECT id, count(*) as count, activated FROM account_data where name = '${login}' AND password = '${hash_password}' `;
    result = await mysqli.login_query(sql_gdb);
    result = result[0];

    return result;
};


const createToken = async (login = undefined, password = undefined, type = undefined, code = undefined, recaptchatoken = undefined) => {

    if (login == undefined) throw `need login`;
    if (password == undefined) throw `need password`;

    /*var recaptcha = new reCAPTCHA({
        siteKey: core.recaptcha.siteKey,
        secretKey: core.recaptcha.secretKey,
        ssl: core.recaptcha.ssl
    });
    let rrcp[]
    let recap = await recaptcha.validate(recaptchatoken)
    .then(function(){
        console.log("success auth");
    })
    .catch(function(errorCodes){
        console.log(recaptcha.translateErrors(errorCodes)); // translate error codes to human readable text
        return `need recaptcha`;
    });

    if(recap == 'need recaptcha') {
        throw `need recaptcha`;
    }*/
    let user;

    user = await getUserByAuth(login, password);
    if (user.count != 1) {
        throw `unknown user`;
    }
    if (user.activated == 0) {
        throw `user is blocked`;
    }


    let hash = crypto.createHash(`sha1`).update(Math.random() + new Date().toLocaleString() + user.id + user.login + user.password).digest(`hex`);
    
    //await mysqli.pow_query( `UPDATE session_codes SET is_active = false WHERE user_fk = '${user.id}'` );
    await mysqli.pow_query( `INSERT INTO session_codes (user_fk, code, is_active) VALUES ('${user.id}', '${hash}', true)` );

    //await mysqli.GDB_query(`UPDATE mcr_users SET time_last = now() WHERE id = '${user.id}'`);

    delete user.count;
    user.token = hash;
    return await user;
};
