const Worker = require(`../../model/worker`);
const User = require(`../../model/user`);
const ACCESS = require(`../../access`);
const fs = require("fs");
const nodemailer = require("nodemailer");

const crypto = require(`crypto`);
const mysqli = require(`../../mysqli`);
const tokens = require(`../token/get`);
const core = require(`../../core`);
const http = require(`http`);

let EmailT = nodemailer.createTransport({
    host: core.email.host,
    port: core.email.port,
    secure: core.email.secure,
    auth: {
        user: core.email.user,
        pass: core.email.pass
    }
});
var request = require('request');

var download = function(uri, filename, callback){
  request.head(uri, function(err, res, body){
    //console.log('content-type:', res.headers['content-type']);
    //console.log('content-length:', res.headers['content-length']);

    request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
  });
};

module.exports = {

    async register(query) {
        query = JSON.parse(query.json);
        let username        = query.username;
        let password        = query.password;
        let re_password     = query.re_password;
        let email_address   = query.email_address;
        let reg_access = true;

        if (!username) { 
            reg_access = false;
        }

        if (!username.match(/^[a-zA-Z0-9]{4,16}$/)) { 
            reg_access = false;
        }

        if (!password) { 
            reg_access = false;
        }

        if (!password.match(/(?=^.{8,}$)((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/)) { 
            reg_access = false;
        }

        if (!re_password) { 
            reg_access = false;
        }

        if (re_password != password) { 
            reg_access = false;
        }

        if (!email_address) { 
            reg_access = false;
        }

        if (!email_address.match(/^[-._a-z0-9]+@(?:[a-z0-9][-a-z0-9]+\.)+[a-z]{2,6}$/)) { 
            reg_access = false;
        }

        if (!reg_access) {
            throw "bad register"
        } else {
            let result,sql_gdb;

            sql_gdb = ` SELECT count(*) as count FROM account_data where name = '${username}'`;
            result = await mysqli.login_query(sql_gdb);
            result = result[0];
    
            if (result['count'] > 0) { throw "bad login" }

            sql_gdb = ` SELECT count(*) as count FROM users where email = '${email_address}'`;
            result = await mysqli.pow_query(sql_gdb);
            result = result[0];

            if (result['count'] > 0) { throw "bad email" }

            let hash_password = crypto.createHash('sha1').update(password).digest("base64");
            await mysqli.pow_query(`
                INSERT INTO users ( activated, avatar_id, bmoney, code, created, email, group_id, ip_address, login, money, password) 
                VALUES ( 1, 0, 0, null, '${(Date.now()/1000)}', '${email_address}', 1, '0.0.0.0', '${username}', 0, '${hash_password}' );
            `);

            sql_gdb = ` SELECT id FROM users where login = '${username}' AND password = '${hash_password}'`;
            result = await mysqli.pow_query(sql_gdb);
            result = result[0];

            await mysqli.login_query(`
                INSERT INTO account_data ( access_level, activated, expire, ip_force, last_hdd, last_ip, last_mac, last_server, membership, name, old_membership, password, pow_user_id, toll) 
                VALUES ( 0, 1, null, '0.0.0.0', 'xx-xx-xx-xx-xx-xx', '0.0.0.0', 'xx-xx-xx-xx-xx-xx', -1, 0, '${username}', 0, '${hash_password}', '${result.id}', 0 );
            `);

            let token = await tokens.cToken(username, password);

            return token;
        }
    },
    async changepass(query, user_id){

        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) {
            throw `access denied`;
        }

        query = JSON.parse(query.json);
        let pass_old     = query.pass_old;
        let pass_new     = query.pass_new;
        let access_code  = query.access_code;
        let changepass_access = true;

        if (!access_code) { 
            changepass_access = false;
            throw "empty access_code";
        }

        if (!await checkaccesscode(user, access_code)) { 
            changepass_access = false;
            throw "bad access_code";
        }

        if (!pass_old) { 
            changepass_access = false;
            throw "empty pass_old";
        }

        if (user.password != crypto.createHash('sha1').update(pass_old).digest("base64")) { 
            changepass_access = false;
            throw "bad pass_old";
        }
        
        if (!pass_new) { 
            changepass_access = false;
            throw "empty pass_new";
        }

        if (!pass_new.match(/(?=^.{8,}$)((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/)) { 
            changepass_access = false;
            throw "bad pass_new";
        }

        if (changepass_access == true) {
            let sql_gdb = `UPDATE account_data SET password = '${crypto.createHash('sha1').update(pass_new).digest("base64")}' WHERE id = '${user.id}'`;
            await mysqli.login_query(sql_gdb);
            await mysqli.pow_query( `UPDATE session_codes SET is_active = false WHERE user_fk = '${user.id}'` );

            let token = await tokens.cToken(user.name, pass_new);
            return token;
        }
    },
    async changeemail(query, user_id){

        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) {
            throw `access denied`;
        }

        query = JSON.parse(query.json);
        let newemail     = query.newemail;
        let access_code  = query.access_code;
        let changeemail_access = true;

        if (!access_code) { 
            changeemail_access = false;
            throw "empty access_code";
        }
        
        if (!await checkaccesscode(user, access_code)) { 
            changeemail_access = false;
            throw "bad access_code";
        }

        if (!newemail) { 
            changeemail_access = false;
            throw "empty newemail";
        }

        if (!newemail.match(/^[-._a-z0-9]+@(?:[a-z0-9][-a-z0-9]+\.)+[a-z]{2,6}$/)) { 
            changeemail_access = false;
            throw "bad email format";
        }

        if (changeemail_access == true) {
            await mysqli.pow_query(`UPDATE users SET email = '${newemail}' WHERE id = '${user.pow_user_id}'`);

            return new Object({
                "success": true,
                "message": `email change`
            })
        }
    },
    async resetpassword(query, user_id){

        query = JSON.parse(query.json);

        let login = query.login;
        let email = query.email;

        if (!login.match(/^[a-zA-Z0-9]{4,16}$/)) { 
            return 'noaccount';
        }
        
        if (!email.match(/^[-._a-z0-9]+@(?:[a-z0-9][-a-z0-9]+\.)+[a-z]{2,6}$/)) { 
            return 'noaccount';
        }

        let co = await mysqli.pow_query(`SELECT count(*) as count, id FROM users WHERE login = '${login}' and email = '${email}'`)

        if (co[0].count = 1) {
            let newpassword = ACCESS.generatePassword();
            await mysqli.login_query(`UPDATE account_data SET password = '${crypto.createHash('sha1').update(newpassword).digest("base64")}' WHERE id = '${co[0].id}'`);
        
            await EmailT.sendMail({
                from: `"${core.email.nsender}" <${core.email.sender}>`,
                to: `${email}`,
                subject: "Восстановление пароля",
                text: "Ваш пароль: " + newpassword,
                html: `Ваш пароль:  <b>${newpassword}</b>`
            });
    
            return 'passsend';
        }
        return 'noaccount';

    },
    async membership(query, user_id){

        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) { throw `access denied`; }
        if (user.race == undefined) { throw `norace`; }

        query = JSON.parse(query.json);

        let vip = await mysqli.pow_query(`SELECT id, price, membership_duration FROM membership WHERE id = '${~~query.vip}'`);
        let ddate = Date.now();
        if (user.expire != null) {
            ddate = new Date(user.expire).getTime();
        }
        let time = new Date(ddate + (vip[0].membership_duration * 3600 * 1000));

        if (user.money - vip[0].price < 0) {
            throw `no money`;
        }

        let format = `${time.getFullYear()}-${time.getMonth()+1}-${time.getDate()} ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}`
        await mysqli.login_query(`UPDATE account_data SET expire = '${format}' WHERE id = '${user.id}'`);
        await mysqli.pow_query(`UPDATE users SET money = money - ${vip[0].price} WHERE id = '${user.pow_user_id}'`);

        return query;
    },
    async secure(query, user_id){
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) {
            throw `access denied`;
        }
        query = JSON.parse(query.json);
        let action = query.action;

        switch (action) {
            case 'activate':
                if (user.login_log == 1 && user.hdd_control == 1) { return "isactive"; }
                await mysqli.login_query( `UPDATE account_data SET login_log = '1', hdd_control = '1' WHERE id = '${user.id}'` );
                return "activeted";
                break;
            case 'deactivate':
                if (user.login_log == 0 && user.hdd_control == 0) { return "isdeactivated"; }
                await mysqli.login_query( `UPDATE account_data SET login_log = '0', hdd_control = '0' WHERE id = '${user.id}'` );
                return "deactiveted";
                break;
            case 'list':
                let res = await mysqli.login_query(`SELECT id, hdd FROM account_valid_hdd WHERE account_id = '${user.id}'`);
                if (res.length > 0) {
                    return res;
                }
                throw 'nodata';
                break;
            case 'add':
                if ((user.login_log == 1 && user.hdd_control == 1) || user.hddsc == 0) { 
                    if (query.code == '') {
                        throw "bad access_code";
                    }
                    if (!await checkaccesscode(user, query.code)) { 
                        throw "bad access_code";
                    }
                    await mysqli.login_query( `UPDATE account_data SET login_log = '0', hdd_control = '0' WHERE id = '${user.id}'` );
                    await mysqli.login_query( `INSERT INTO secure_worker (acc_id) VALUES ('${user.id}')` );
                    let res = await mysqli.login_query(`INSERT INTO account_valid_hdd_steps (account_id, hdd, accepta) VALUES ('${user.id}', '${user.last_hdd}', 1)`);
                    return true;
                }
                throw 'nodata';
                break;
            case 'del':
                if (user.login_log == 1 && user.hdd_control == 1) { 
                    if (query.code == '') {
                        throw "bad access_code";
                    }
                    if (!await checkaccesscode(user, query.code)) { 
                        throw "bad access_code";
                    }
                    await mysqli.login_query( `UPDATE account_data SET login_log = '0', hdd_control = '0' WHERE id = '${user.id}'` );
                    await mysqli.login_query( `DELETE FROM account_valid_hdd WHERE account_id = '${user.id}' AND id = '${query.id}'` );
                    return true;
                }
                throw 'nodata';
                break;
            case 'needacceptlist':
                if ((user.login_log == 1 && user.hdd_control == 1) || user.hddsc == 0) { 
                    let res = await mysqli.login_query(`SELECT * FROM account_valid_hdd_steps WHERE hdd = '${user.last_hdd}' AND account_id = '${user.id}' AND (accepta IS NULL OR acceptb IS NULL OR acceptc IS NULL OR acceptd IS NULL OR accepte IS NULL)`);
                    if (res[0]) {
                        return res[0];
                    }
                    throw 'nodata';
                }
                throw 'nodata';
                break;
            case 'acceptinfoaccount':
                if ((user.login_log == 1 && user.hdd_control == 1) || user.hddsc == 0) { 
                    let res = await mysqli.login_query(`SELECT * FROM account_valid_hdd_steps WHERE hdd = '${user.last_hdd}' AND account_id = '${user.id}' AND (accepta IS NULL OR acceptb IS NULL OR acceptc IS NULL OR acceptd IS NULL OR accepte IS NULL)`);
                    res = res[0];
                    if (res.accepta == 1 && res.acceptb == null) {
                        if (user.name == query.login && user.password == crypto.createHash('sha1').update(query.pass).digest("base64")) {
                            mysqli.login_query(`UPDATE account_valid_hdd_steps SET acceptb = '1' WHERE hdd = '${user.last_hdd}' AND account_id = '${user.id}' `);
                            return true;
                        } else {
                            throw 'badacc';
                        }
                    }
                }
                throw 'nodata';
                break;
            case 'acceptingameexit':
                if ((user.login_log == 1 && user.hdd_control == 1) || user.hddsc == 0) { 
                    let res = await mysqli.login_query(`SELECT * FROM account_valid_hdd_steps WHERE hdd = '${user.last_hdd}' AND account_id = '${user.id}' AND (accepta IS NULL OR acceptb IS NULL OR acceptc IS NULL OR acceptd IS NULL OR accepte IS NULL)`);
                    res = res[0];
                    if (res.accepta == 1 && res.acceptb == 1 && res.acceptc == null) {
                        let ppp = await mysqli.game_query(`SELECT sum(online) as online FROM players WHERE account_id = '${user.id}'`);
                        ppp = ppp[0];
                        if (ppp.online == 0) {
                            mysqli.login_query(`UPDATE account_valid_hdd_steps SET acceptc = '1' WHERE hdd = '${user.last_hdd}' AND account_id = '${user.id}' `);
                            return true;
                        }
                    }
                }
                throw 'nodata';
                break;
            case 'acceptingamejoin':
                if ((user.login_log == 1 && user.hdd_control == 1) || user.hddsc == 0) { 
                    let res = await mysqli.login_query(`SELECT * FROM account_valid_hdd_steps WHERE hdd = '${user.last_hdd}' AND account_id = '${user.id}' AND (accepta IS NULL OR acceptb IS NULL OR acceptc IS NULL OR acceptd IS NULL OR accepte IS NULL)`);
                    res = res[0];
                    if (res.accepta == 1 && res.acceptb == 1 && res.acceptc == 1 && res.acceptd == null) {
                        let ppp = await mysqli.game_query(`SELECT sum(online) as online FROM players WHERE account_id = '${user.id}'`);
                        ppp = ppp[0];
                        if (ppp.online == 1) {
                            mysqli.login_query(`UPDATE account_valid_hdd_steps SET acceptd = '1' WHERE hdd = '${user.last_hdd}' AND account_id = '${user.id}' `);

                            /*let code = ACCESS.generatePassword();
                            await mysqli.pow_query( `UPDATE access_codes SET is_active = 'false' WHERE login = '${user.name}'` );
                            await mysqli.pow_query( `INSERT INTO access_codes ( login, access_code, is_active ) VALUES('${user.name}','${code}', 'true' )` );
                    
                    
                            let info = await EmailT.sendMail({
                                from: `"${core.email.nsender}" <${core.email.sender}>`,
                                to: `${user.email}`,
                                subject: "Код подтверждения",
                                text: "Ваш код подтверждения: " + code,
                                html: `Ваш код подтверждения:  <b>${code}</b>`
                            });*/

                            return true;
                        }
                    }
                }
                throw 'nodata';
                break;
            case 'acceptinfodcode':
                if ((user.login_log == 1 && user.hdd_control == 1) || user.hddsc == 0) { 
                    let res = await mysqli.login_query(`SELECT * FROM account_valid_hdd_steps WHERE hdd = '${user.last_hdd}' AND account_id = '${user.id}' AND (accepta IS NULL OR acceptb IS NULL OR acceptc IS NULL OR acceptd IS NULL OR accepte IS NULL)`);
                    res = res[0];
                    if (res.accepta == 1 && res.acceptb == 1 && res.acceptc == 1 && res.acceptd == 1 && res.accepte == null) {

                        await mysqli.login_query( `UPDATE account_valid_hdd_steps SET accepte = '1' WHERE hdd = '${user.last_hdd}' AND account_id = '${user.id}' `);
                        await mysqli.login_query( `UPDATE account_data SET login_log = '1', hdd_control = '1' WHERE id = '${user.id}'` );
                        await mysqli.login_query( `INSERT INTO account_valid_hdd ( account_id, hdd ) VALUES('${user.id}','${res.hdd}' )` );
                        return true;
                    }
                    throw 'nodata';
                }
                throw 'nodata';
                break;

        }
        
    },
    async achievement(query, user_id){
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) {
            throw `access denied`;
        }
        query = JSON.parse(query.json);
        let action = query.action;
        let player = ~~query.player;

        let pl = await mysqli.game_query(` SELECT count(id) as count FROM players WHERE account_id = '${user.id}' and id = '${player}' `);
        if (pl[0].count != 1) { return ''; }

        let race = (user.race == 'ELYOS')?'ely':'asm';
        let alist;
        let achiv;
        let rewarditems;
        let rwitems = {};
        let getrwitems = {};
        let plachievcomplite = {};
        
        getrewarditems = await mysqli.game_query(` SELECT * FROM bonuspacks_getted WHERE uid = '${user.id}' `);
        for (let yy in getrewarditems) {
            if (getrewarditems.hasOwnProperty(yy)) {
                let eb = getrewarditems[yy];
                getrwitems[eb.packid] = true;
            }
        }

        let gethtml = async (id, html) => {

            if (html == null || html == "") {

                let promise = new Promise(function(resolve, reject) {
                    http.get(`http://aiondatabase.net/tip.php?id=item--${id}&l=ru&nf=on`, (resp) => {
                        let data = '';
                        resp.on('data', (chunk) => {
                            data += chunk;
                        });
                        resp.on('end', () => {
                            resolve(data);
                        });
                    }).on("error", (err) => {
                        console.log("Error: " + err.message);
                    });
                })
        
                res = await promise;
                await mysqli.pow_query(` UPDATE bonuspacks SET html = '${res}' WHERE item_id = '${id}' `);

                let rrt = res.match(/src="([^\'\"]+)/i);

                download('http://aiondatabase.net' + rrt[1], '/var/www/cdn.aiondestiny' + rrt[1], function(){ });
                return res;

            }

            return html;

        }

        switch (action) {
            case 'list':
                alist = await mysqli.game_query(` SELECT * FROM player_achievements_list WHERE (race = 'all' OR race = '${race}') and is_active = '1'`);
                let playerchievs = [];
                let ach = {}

                achiv = await mysqli.game_query(` SELECT * FROM player_achievements WHERE player_id = '${player}' `);
                
                for (let nnc in achiv) {
                    if (achiv.hasOwnProperty(nnc)) {
                        let zxc = achiv[nnc];
                        plachievcomplite[zxc.achievement_id] = zxc.progress;
                    }
                }

                for (let key in alist) {
                    if (alist.hasOwnProperty(key)) {
                        let el = alist[key];
                        let count = 0;
                        let maxcount = 0;

                        rewarditems = await mysqli.pow_query(` 
                            SELECT * FROM bonuspacks WHERE 
                            (pack_name = 'a${el.id}packa' OR 
                            pack_name = 'a${el.id}packb' OR 
                            pack_name = 'a${el.id}packc' OR 
                            pack_name = 'a${el.id}packd' OR 
                            pack_name = 'a${el.id}packe') AND
                            is_active = '1'
                        `);

                        switch (el.id) {
                            case 1:
                                if (el.reward_a > 0) { maxcount = el.reward_a; }
                                if (el.reward_b > maxcount) { maxcount = el.reward_b; }
                                if (el.reward_c > maxcount) { maxcount = el.reward_c; }
                                if (el.reward_d > maxcount) { maxcount = el.reward_d; }
                                if (el.reward_e > maxcount) { maxcount = el.reward_e; }

                                if (plachievcomplite[el.id]) {
                                    count = plachievcomplite[el.id];
                                    if (count > maxcount) {
                                        count = maxcount;
                                    }
                                }

                                rwitems = {};
                                for (let yy in rewarditems) {
                                    if (rewarditems.hasOwnProperty(yy)) {
                                        let eb = rewarditems[yy];
                                        if (!rwitems[eb.pack_name]) {
                                            rwitems[eb.pack_name] = [];
                                        }
                                        
                                        rwitems[eb.pack_name].push({
                                            item_id: eb.item_id,
                                            pack_name: eb.pack_name,
                                            count: eb.count,
                                            html: await gethtml(eb.item_id, eb.html)
                                        })
                                    }
                                }


                                ach = {
                                    id: el.id,
                                    name: el.name,
                                    desc: el.desc,
                                    bktype: 'cromed',
                                    count: count,
                                    maxcount: maxcount,
                                    rewards: [el.reward_a, el.reward_b, el.reward_c, el.reward_d, el.reward_e],
                                    rwitems: rwitems,
                                    getrewarditems: getrewarditems
                                }
                                playerchievs.push(ach);
                                break;
                            case 2:
                                
                                if (el.reward_a > 0) { maxcount = el.reward_a; }
                                if (el.reward_b > maxcount) { maxcount = el.reward_b; }
                                if (el.reward_c > maxcount) { maxcount = el.reward_c; }
                                if (el.reward_d > maxcount) { maxcount = el.reward_d; }
                                if (el.reward_e > maxcount) { maxcount = el.reward_e; }

                                if (plachievcomplite[el.id]) {
                                    count = plachievcomplite[el.id];
                                    if (count > maxcount) {
                                        count = maxcount;
                                    }
                                }
                                rwitems = {};
                                for (let yy in rewarditems) {
                                    if (rewarditems.hasOwnProperty(yy)) {
                                        let eb = rewarditems[yy];
                                        if (!rwitems[eb.pack_name]) {
                                            rwitems[eb.pack_name] = [];
                                        }
                                        
                                        rwitems[eb.pack_name].push({
                                            item_id: eb.item_id,
                                            pack_name: eb.pack_name,
                                            count: eb.count,
                                            html: await gethtml(eb.item_id, eb.html)
                                        })
                                    }
                                }


                                ach = {
                                    id: el.id,
                                    name: el.name,
                                    desc: el.desc,
                                    bktype: 'tahabataft',
                                    count: count,
                                    maxcount: maxcount,
                                    rewards: [el.reward_a, el.reward_b, el.reward_c, el.reward_d, el.reward_e],
                                    rwitems: rwitems
                                }
                                playerchievs.push(ach);
                                break;
                            case 3:
                                
                                if (el.reward_a > 0) { maxcount = el.reward_a; }
                                if (el.reward_b > maxcount) { maxcount = el.reward_b; }
                                if (el.reward_c > maxcount) { maxcount = el.reward_c; }
                                if (el.reward_d > maxcount) { maxcount = el.reward_d; }
                                if (el.reward_e > maxcount) { maxcount = el.reward_e; }

                                if (plachievcomplite[el.id]) {
                                    count = plachievcomplite[el.id];
                                    if (count > maxcount) {
                                        count = maxcount;
                                    }
                                }

                                rwitems = {};
                                for (let yy in rewarditems) {
                                    if (rewarditems.hasOwnProperty(yy)) {
                                        let eb = rewarditems[yy];
                                        if (!rwitems[eb.pack_name]) {
                                            rwitems[eb.pack_name] = [];
                                        }
                                        
                                        rwitems[eb.pack_name].push({
                                            item_id: eb.item_id,
                                            pack_name: eb.pack_name,
                                            count: eb.count,
                                            html: await gethtml(eb.item_id, eb.html)
                                        })
                                    }
                                }
                                ach = {
                                    id: el.id,
                                    name: el.name,
                                    desc: el.desc,
                                    bktype: 'rudra',
                                    count: count,
                                    maxcount: maxcount,
                                    rewards: [el.reward_a, el.reward_b, el.reward_c, el.reward_d, el.reward_e],
                                    rwitems: rwitems
                                }
                                playerchievs.push(ach);
                                break;
                            case 4:
                                
                                if (el.reward_a > 0) { maxcount = el.reward_a; }
                                if (el.reward_b > maxcount) { maxcount = el.reward_b; }
                                if (el.reward_c > maxcount) { maxcount = el.reward_c; }
                                if (el.reward_d > maxcount) { maxcount = el.reward_d; }
                                if (el.reward_e > maxcount) { maxcount = el.reward_e; }

                                if (plachievcomplite[el.id]) {
                                    count = plachievcomplite[el.id];
                                    if (count > maxcount) {
                                        count = maxcount;
                                    }
                                }

                                rwitems = {};
                                for (let yy in rewarditems) {
                                    if (rewarditems.hasOwnProperty(yy)) {
                                        let eb = rewarditems[yy];
                                        if (!rwitems[eb.pack_name]) {
                                            rwitems[eb.pack_name] = [];
                                        }
                                        
                                        rwitems[eb.pack_name].push({
                                            item_id: eb.item_id,
                                            pack_name: eb.pack_name,
                                            count: eb.count,
                                            html: await gethtml(eb.item_id, eb.html)
                                        })
                                    }
                                }
                                ach = {
                                    id: el.id,
                                    name: el.name,
                                    desc: el.desc,
                                    bktype: 'tahabataftt',
                                    count: count,
                                    maxcount: maxcount,
                                    rewards: [el.reward_a, el.reward_b, el.reward_c, el.reward_d, el.reward_e],
                                    rwitems: rwitems
                                }
                                playerchievs.push(ach);
                                break;
                            case 5:
                                
                                if (el.reward_a > 0) { maxcount = el.reward_a; }
                                if (el.reward_b > maxcount) { maxcount = el.reward_b; }
                                if (el.reward_c > maxcount) { maxcount = el.reward_c; }
                                if (el.reward_d > maxcount) { maxcount = el.reward_d; }
                                if (el.reward_e > maxcount) { maxcount = el.reward_e; }

                                if (plachievcomplite[el.id]) {
                                    count = plachievcomplite[el.id];
                                    if (count > maxcount) {
                                        count = maxcount;
                                    }
                                }

                                rwitems = {};
                                for (let yy in rewarditems) {
                                    if (rewarditems.hasOwnProperty(yy)) {
                                        let eb = rewarditems[yy];
                                        if (!rwitems[eb.pack_name]) {
                                            rwitems[eb.pack_name] = [];
                                        }
                                        
                                        rwitems[eb.pack_name].push({
                                            item_id: eb.item_id,
                                            pack_name: eb.pack_name,
                                            count: eb.count,
                                            html: await gethtml(eb.item_id, eb.html)
                                        })
                                    }
                                }
                                ach = {
                                    id: el.id,
                                    name: el.name,
                                    desc: el.desc,
                                    bktype: 'tiamat',
                                    count: count,
                                    maxcount: maxcount,
                                    rewards: [el.reward_a, el.reward_b, el.reward_c, el.reward_d, el.reward_e],
                                    rwitems: rwitems
                                }
                                playerchievs.push(ach);
                                break;
                            case 6:
                                
                                if (el.reward_a > 0) { maxcount = el.reward_a; }
                                if (el.reward_b > maxcount) { maxcount = el.reward_b; }
                                if (el.reward_c > maxcount) { maxcount = el.reward_c; }
                                if (el.reward_d > maxcount) { maxcount = el.reward_d; }
                                if (el.reward_e > maxcount) { maxcount = el.reward_e; }

                                if (plachievcomplite[el.id]) {
                                    count = plachievcomplite[el.id];
                                    if (count > maxcount) {
                                        count = maxcount;
                                    }
                                }

                                rwitems = {};
                                for (let yy in rewarditems) {
                                    if (rewarditems.hasOwnProperty(yy)) {
                                        let eb = rewarditems[yy];
                                        if (!rwitems[eb.pack_name]) {
                                            rwitems[eb.pack_name] = [];
                                        }
                                        
                                        rwitems[eb.pack_name].push({
                                            item_id: eb.item_id,
                                            pack_name: eb.pack_name,
                                            count: eb.count,
                                            html: await gethtml(eb.item_id, eb.html)
                                        })
                                    }
                                }
                                ach = {
                                    id: el.id,
                                    name: el.name,
                                    desc: el.desc,
                                    bktype: 'yamenes',
                                    count: count,
                                    maxcount: maxcount,
                                    rewards: [el.reward_a, el.reward_b, el.reward_c, el.reward_d, el.reward_e],
                                    rwitems: rwitems
                                }
                                playerchievs.push(ach);
                                break;
                            case 7:
                                
                                if (el.reward_a > 0) { maxcount = el.reward_a; }
                                if (el.reward_b > maxcount) { maxcount = el.reward_b; }
                                if (el.reward_c > maxcount) { maxcount = el.reward_c; }
                                if (el.reward_d > maxcount) { maxcount = el.reward_d; }
                                if (el.reward_e > maxcount) { maxcount = el.reward_e; }

                                if (plachievcomplite[el.id]) {
                                    count = plachievcomplite[el.id];
                                    if (count > maxcount) {
                                        count = maxcount;
                                    }
                                }

                                rwitems = {};
                                for (let yy in rewarditems) {
                                    if (rewarditems.hasOwnProperty(yy)) {
                                        let eb = rewarditems[yy];
                                        if (!rwitems[eb.pack_name]) {
                                            rwitems[eb.pack_name] = [];
                                        }
                                        
                                        rwitems[eb.pack_name].push({
                                            item_id: eb.item_id,
                                            pack_name: eb.pack_name,
                                            count: eb.count,
                                            html: await gethtml(eb.item_id, eb.html)
                                        })
                                    }
                                }
                                ach = {
                                    id: el.id,
                                    name: el.name,
                                    desc: el.desc,
                                    bktype: '',
                                    count: count,
                                    maxcount: maxcount,
                                    rewards: [el.reward_a, el.reward_b, el.reward_c, el.reward_d, el.reward_e],
                                    rwitems: rwitems
                                }
                                playerchievs.push(ach);
                                break;
                            case 8:
                                
                                if (el.reward_a > 0) { maxcount = el.reward_a; }
                                if (el.reward_b > maxcount) { maxcount = el.reward_b; }
                                if (el.reward_c > maxcount) { maxcount = el.reward_c; }
                                if (el.reward_d > maxcount) { maxcount = el.reward_d; }
                                if (el.reward_e > maxcount) { maxcount = el.reward_e; }

                                if (plachievcomplite[el.id]) {
                                    count = plachievcomplite[el.id];
                                    if (count > maxcount) {
                                        count = maxcount;
                                    }
                                }

                                rwitems = {};
                                for (let yy in rewarditems) {
                                    if (rewarditems.hasOwnProperty(yy)) {
                                        let eb = rewarditems[yy];
                                        if (!rwitems[eb.pack_name]) {
                                            rwitems[eb.pack_name] = [];
                                        }
                                        
                                        rwitems[eb.pack_name].push({
                                            item_id: eb.item_id,
                                            pack_name: eb.pack_name,
                                            count: eb.count,
                                            html: await gethtml(eb.item_id, eb.html)
                                        })
                                    }
                                }
                                ach = {
                                    id: el.id,
                                    name: el.name,
                                    desc: el.desc,
                                    bktype: '',
                                    count: count,
                                    maxcount: maxcount,
                                    rewards: [el.reward_a, el.reward_b, el.reward_c, el.reward_d, el.reward_e],
                                    rwitems: rwitems
                                }
                                playerchievs.push(ach);
                                break;
                            case 9:

                                let lvl = await mysqli.game_query(`SELECT exp FROM players WHERE account_id = '${user.id}' AND id = '${player}'`);
                                
                                if (el.reward_a > 0) { maxcount = el.reward_a; }
                                if (el.reward_b > maxcount) { maxcount = el.reward_b; }
                                if (el.reward_c > maxcount) { maxcount = el.reward_c; }
                                if (el.reward_d > maxcount) { maxcount = el.reward_d; }
                                if (el.reward_e > maxcount) { maxcount = el.reward_e; }

                                rwitems = {};
                                for (let yy in rewarditems) {
                                    if (rewarditems.hasOwnProperty(yy)) {
                                        let eb = rewarditems[yy];
                                        if (!rwitems[eb.pack_name]) {
                                            rwitems[eb.pack_name] = [];
                                        }
                                        
                                        rwitems[eb.pack_name].push({
                                            item_id: eb.item_id,
                                            pack_name: eb.pack_name,
                                            count: eb.count,
                                            html: await gethtml(eb.item_id, eb.html)
                                        })
                                    }
                                }
                                ach = {
                                    id: el.id,
                                    name: el.name,
                                    desc: el.desc,
                                    bktype: '',
                                    count: getLvl(lvl[0].exp),
                                    maxcount: maxcount,
                                    rewards: [el.reward_a, el.reward_b, el.reward_c, el.reward_d, el.reward_e],
                                    rwitems: rwitems
                                }
                                playerchievs.push(ach);
                                break;
                            case 10:
                                
                                if (el.reward_a > 0) { maxcount = el.reward_a; }
                                if (el.reward_b > maxcount) { maxcount = el.reward_b; }
                                if (el.reward_c > maxcount) { maxcount = el.reward_c; }
                                if (el.reward_d > maxcount) { maxcount = el.reward_d; }
                                if (el.reward_e > maxcount) { maxcount = el.reward_e; }

                                achiv = await mysqli.game_query(` SELECT complete_count FROM player_quests WHERE player_id = '${player}' AND quest_id = '28305' `);
                                if (achiv[0] && achiv[0].complete_count) {
                                    count = achiv[0].complete_count;
                                    if (count > maxcount) {
                                        count = maxcount;
                                    }
                                }

                                rwitems = {};
                                for (let yy in rewarditems) {
                                    if (rewarditems.hasOwnProperty(yy)) {
                                        let eb = rewarditems[yy];
                                        if (!rwitems[eb.pack_name]) {
                                            rwitems[eb.pack_name] = [];
                                        }
                                        
                                        rwitems[eb.pack_name].push({
                                            item_id: eb.item_id,
                                            pack_name: eb.pack_name,
                                            count: eb.count,
                                            html: await gethtml(eb.item_id, eb.html)
                                        })
                                    }
                                }
                                ach = {
                                    id: el.id,
                                    name: el.name,
                                    desc: el.desc,
                                    bktype: 'ingis',
                                    count: count,
                                    maxcount: maxcount,
                                    rewards: [el.reward_a, el.reward_b, el.reward_c, el.reward_d, el.reward_e],
                                    rwitems: rwitems
                                }
                                playerchievs.push(ach);
                                break;
                            case 11:
                                
                                if (el.reward_a > 0) { maxcount = el.reward_a; }
                                if (el.reward_b > maxcount) { maxcount = el.reward_b; }
                                if (el.reward_c > maxcount) { maxcount = el.reward_c; }
                                if (el.reward_d > maxcount) { maxcount = el.reward_d; }
                                if (el.reward_e > maxcount) { maxcount = el.reward_e; }

                                achiv = await mysqli.game_query(` SELECT complete_count FROM player_quests WHERE player_id = '${player}' AND quest_id = '18811' `);
                                if (achiv[0] && achiv[0].complete_count) {
                                    count = achiv[0].complete_count;
                                    if (count > maxcount) {
                                        count = maxcount;
                                    }
                                }

                                rwitems = {};
                                for (let yy in rewarditems) {
                                    if (rewarditems.hasOwnProperty(yy)) {
                                        let eb = rewarditems[yy];
                                        if (!rwitems[eb.pack_name]) {
                                            rwitems[eb.pack_name] = [];
                                        }
                                        
                                        rwitems[eb.pack_name].push({
                                            item_id: eb.item_id,
                                            pack_name: eb.pack_name,
                                            count: eb.count,
                                            html: await gethtml(eb.item_id, eb.html)
                                        })
                                    }
                                }
                                ach = {
                                    id: el.id,
                                    name: el.name,
                                    desc: el.desc,
                                    bktype: 'kelk',
                                    count: count,
                                    maxcount: maxcount,
                                    rewards: [el.reward_a, el.reward_b, el.reward_c, el.reward_d, el.reward_e],
                                    rwitems: rwitems
                                }
                                playerchievs.push(ach);
                                break;
                            case 12:
                                
                                if (el.reward_a > 0) { maxcount = el.reward_a; }
                                if (el.reward_b > maxcount) { maxcount = el.reward_b; }
                                if (el.reward_c > maxcount) { maxcount = el.reward_c; }
                                if (el.reward_d > maxcount) { maxcount = el.reward_d; }
                                if (el.reward_e > maxcount) { maxcount = el.reward_e; }

                                achiv = await mysqli.game_query(` SELECT complete_count FROM player_quests WHERE player_id = '${player}' AND quest_id = '18305' `);
                                if (achiv[0] && achiv[0].complete_count) {
                                    count = achiv[0].complete_count;
                                    if (count > maxcount) {
                                        count = maxcount;
                                    }
                                }

                                rwitems = {};
                                for (let yy in rewarditems) {
                                    if (rewarditems.hasOwnProperty(yy)) {
                                        let eb = rewarditems[yy];
                                        if (!rwitems[eb.pack_name]) {
                                            rwitems[eb.pack_name] = [];
                                        }
                                        
                                        rwitems[eb.pack_name].push({
                                            item_id: eb.item_id,
                                            pack_name: eb.pack_name,
                                            count: eb.count,
                                            html: await gethtml(eb.item_id, eb.html)
                                        })
                                    }
                                }
                                ach = {
                                    id: el.id,
                                    name: el.name,
                                    desc: el.desc,
                                    bktype: 'ingis',
                                    count: count,
                                    maxcount: maxcount,
                                    rewards: [el.reward_a, el.reward_b, el.reward_c, el.reward_d, el.reward_e],
                                    rwitems: rwitems
                                }
                                playerchievs.push(ach);
                                break;
                            case 13:
                                
                                if (el.reward_a > 0) { maxcount = el.reward_a; }
                                if (el.reward_b > maxcount) { maxcount = el.reward_b; }
                                if (el.reward_c > maxcount) { maxcount = el.reward_c; }
                                if (el.reward_d > maxcount) { maxcount = el.reward_d; }
                                if (el.reward_e > maxcount) { maxcount = el.reward_e; }

                                achiv = await mysqli.game_query(` SELECT complete_count FROM player_quests WHERE player_id = '${player}' AND quest_id = '28811' `);
                                if (achiv[0] && achiv[0].complete_count) {
                                    count = achiv[0].complete_count;
                                    if (count > maxcount) {
                                        count = maxcount;
                                    }
                                }

                                rwitems = {};
                                for (let yy in rewarditems) {
                                    if (rewarditems.hasOwnProperty(yy)) {
                                        let eb = rewarditems[yy];
                                        if (!rwitems[eb.pack_name]) {
                                            rwitems[eb.pack_name] = [];
                                        }
                                        
                                        rwitems[eb.pack_name].push({
                                            item_id: eb.item_id,
                                            pack_name: eb.pack_name,
                                            count: eb.count,
                                            html: await gethtml(eb.item_id, eb.html)
                                        })
                                    }
                                }
                                ach = {
                                    id: el.id,
                                    name: el.name,
                                    desc: el.desc,
                                    bktype: 'kelk',
                                    count: count,
                                    maxcount: maxcount,
                                    rewards: [el.reward_a, el.reward_b, el.reward_c, el.reward_d, el.reward_e],
                                    rwitems: rwitems
                                }
                                playerchievs.push(ach);
                                break;
                            case 14:
                                
                                if (el.reward_a > 0) { maxcount = el.reward_a; }
                                if (el.reward_b > maxcount) { maxcount = el.reward_b; }
                                if (el.reward_c > maxcount) { maxcount = el.reward_c; }
                                if (el.reward_d > maxcount) { maxcount = el.reward_d; }
                                if (el.reward_e > maxcount) { maxcount = el.reward_e; }

                                achiv = await mysqli.game_query(` SELECT max_rank FROM abyss_rank WHERE player_id = '${player}' `);
                                if (achiv[0] && achiv[0].max_rank) {
                                    if (achiv[0].max_rank >= 9) {
                                        count = 1;
                                    }
                                }

                                rwitems = {};
                                for (let yy in rewarditems) {
                                    if (rewarditems.hasOwnProperty(yy)) {
                                        let eb = rewarditems[yy];
                                        if (!rwitems[eb.pack_name]) {
                                            rwitems[eb.pack_name] = [];
                                        }
                                        
                                        rwitems[eb.pack_name].push({
                                            item_id: eb.item_id,
                                            pack_name: eb.pack_name,
                                            count: eb.count,
                                            html: await gethtml(eb.item_id, eb.html)
                                        })
                                    }
                                }
                                ach = {
                                    id: el.id,
                                    name: el.name,
                                    desc: el.desc,
                                    bktype: '',
                                    count: count,
                                    maxcount: maxcount,
                                    rewards: [el.reward_a, el.reward_b, el.reward_c, el.reward_d, el.reward_e],
                                    rwitems: rwitems
                                }
                                playerchievs.push(ach);
                                break;
                            case 15:
                                
                                if (el.reward_a > 0) { maxcount = el.reward_a; }
                                if (el.reward_b > maxcount) { maxcount = el.reward_b; }
                                if (el.reward_c > maxcount) { maxcount = el.reward_c; }
                                if (el.reward_d > maxcount) { maxcount = el.reward_d; }
                                if (el.reward_e > maxcount) { maxcount = el.reward_e; }

                                achiv = await mysqli.game_query(` SELECT max_rank FROM abyss_rank WHERE player_id = '${player}' `);
                                if (achiv[0] && achiv[0].max_rank) {
                                    if (achiv[0].max_rank >= 10) {
                                        count = 1;
                                    }
                                }

                                rwitems = {};
                                for (let yy in rewarditems) {
                                    if (rewarditems.hasOwnProperty(yy)) {
                                        let eb = rewarditems[yy];
                                        if (!rwitems[eb.pack_name]) {
                                            rwitems[eb.pack_name] = [];
                                        }
                                        
                                        rwitems[eb.pack_name].push({
                                            item_id: eb.item_id,
                                            pack_name: eb.pack_name,
                                            count: eb.count,
                                            html: await gethtml(eb.item_id, eb.html)
                                        })
                                    }
                                }
                                ach = {
                                    id: el.id,
                                    name: el.name,
                                    desc: el.desc,
                                    bktype: '',
                                    count: count,
                                    maxcount: maxcount,
                                    rewards: [el.reward_a, el.reward_b, el.reward_c, el.reward_d, el.reward_e],
                                    rwitems: rwitems
                                }
                                playerchievs.push(ach);
                                break;
                            case 16:
                                
                                if (el.reward_a > 0) { maxcount = el.reward_a; }
                                if (el.reward_b > maxcount) { maxcount = el.reward_b; }
                                if (el.reward_c > maxcount) { maxcount = el.reward_c; }
                                if (el.reward_d > maxcount) { maxcount = el.reward_d; }
                                if (el.reward_e > maxcount) { maxcount = el.reward_e; }

                                if (plachievcomplite[el.id]) {
                                    count = plachievcomplite[el.id];
                                    if (count > maxcount) {
                                        count = maxcount;
                                    }
                                }

                                rwitems = {};
                                for (let yy in rewarditems) {
                                    if (rewarditems.hasOwnProperty(yy)) {
                                        let eb = rewarditems[yy];
                                        if (!rwitems[eb.pack_name]) {
                                            rwitems[eb.pack_name] = [];
                                        }
                                        
                                        rwitems[eb.pack_name].push({
                                            item_id: eb.item_id,
                                            pack_name: eb.pack_name,
                                            count: eb.count,
                                            html: await gethtml(eb.item_id, eb.html)
                                        })
                                    }
                                }
                                ach = {
                                    id: el.id,
                                    name: el.name,
                                    desc: el.desc,
                                    bktype: 'goldarena',
                                    count: count,
                                    maxcount: maxcount,
                                    rewards: [el.reward_a, el.reward_b, el.reward_c, el.reward_d, el.reward_e],
                                    rwitems: rwitems
                                }
                                playerchievs.push(ach);
                                break;
                            case 17:
                                
                                if (el.reward_a > 0) { maxcount = el.reward_a; }
                                if (el.reward_b > maxcount) { maxcount = el.reward_b; }
                                if (el.reward_c > maxcount) { maxcount = el.reward_c; }
                                if (el.reward_d > maxcount) { maxcount = el.reward_d; }
                                if (el.reward_e > maxcount) { maxcount = el.reward_e; }

                                if (plachievcomplite[el.id]) {
                                    count = plachievcomplite[el.id];
                                    if (count > maxcount) {
                                        count = maxcount;
                                    }
                                }

                                rwitems = {};
                                for (let yy in rewarditems) {
                                    if (rewarditems.hasOwnProperty(yy)) {
                                        let eb = rewarditems[yy];
                                        if (!rwitems[eb.pack_name]) {
                                            rwitems[eb.pack_name] = [];
                                        }
                                        
                                        rwitems[eb.pack_name].push({
                                            item_id: eb.item_id,
                                            pack_name: eb.pack_name,
                                            count: eb.count,
                                            html: await gethtml(eb.item_id, eb.html)
                                        })
                                    }
                                }
                                ach = {
                                    id: el.id,
                                    name: el.name,
                                    desc: el.desc,
                                    bktype: 'goldarena',
                                    count: count,
                                    maxcount: maxcount,
                                    rewards: [el.reward_a, el.reward_b, el.reward_c, el.reward_d, el.reward_e],
                                    rwitems: rwitems
                                }
                                playerchievs.push(ach);
                                break;
                        }
                    }
                }
                return {
                    playerchievs:playerchievs,
                    getrwitems: getrwitems
                };
                break;
            case 'add':
                let achiev = ~~query.achiev;
                alist = await mysqli.game_query(` SELECT * FROM player_achievements_list WHERE (race = 'all' OR race = '${race}') AND id = '${achiev}' `);
                let el = alist[0];
                let alistgetted;
                let maxcount = 0;
                let givedc = 0;

                switch (achiev) {
                    case 1: 
                    case 2:
                    case 3:
                    case 4:
                    case 5:
                    case 6:
                    case 7:
                    case 8:
                    case 16:
                    case 17:
                        achiv = await mysqli.game_query(` SELECT * FROM player_achievements WHERE player_id = '${player}' AND achievement_id = '${achiev}' `);

                        if (achiv[0] && (achiv[0].progress >= el.reward_a) && el.reward_a != 0) {
                            alistgetted = await mysqli.game_query(` SELECT count(*) as count FROM bonuspacks_getted WHERE pid = '${player}' AND packid = 'a${achiev}packa' `);
                            if(alistgetted[0].count == 0){
                                mysqli.game_query(` INSERT INTO bonuspacks_getted ( uid, pid, packid ) VALUES('${player}', '${player}', 'a${achiev}packa' ) `);
                                givedc++;
                            }
                        }
                        if (achiv[0] && (achiv[0].progress >= el.reward_b) && el.reward_b != 0) {
                            alistgetted = await mysqli.game_query(` SELECT count(*) as count FROM bonuspacks_getted WHERE pid = '${player}' AND packid = 'a${achiev}packb' `);
                            if(alistgetted[0].count == 0){
                                mysqli.game_query(` INSERT INTO bonuspacks_getted ( uid, pid, packid ) VALUES('${player}', '${player}', 'a${achiev}packb' ) `);
                                givedc++;
                            }
                        }
                        if (achiv[0] && (achiv[0].progress >= el.reward_c) && el.reward_c != 0) {
                            alistgetted = await mysqli.game_query(` SELECT count(*) as count FROM bonuspacks_getted WHERE pid = '${player}' AND packid = 'a${achiev}packc' `);
                            if(alistgetted[0].count == 0){
                                mysqli.game_query(` INSERT INTO bonuspacks_getted ( uid, pid, packid ) VALUES('${player}', '${player}', 'a${achiev}packc' ) `);
                                givedc++;
                            }
                        }
                        if (achiv[0] && (achiv[0].progress >= el.reward_d) && el.reward_d != 0) {
                            alistgetted = await mysqli.game_query(` SELECT count(*) as count FROM bonuspacks_getted WHERE pid = '${player}' AND packid = 'a${achiev}packd' `);
                            if(alistgetted[0].count == 0){
                                mysqli.game_query(` INSERT INTO bonuspacks_getted ( uid, pid, packid ) VALUES('${player}', '${player}', 'a${achiev}packd' ) `);
                                givedc++;
                            }
                        }
                        if (achiv[0] && (achiv[0].progress >= el.reward_e) && el.reward_e != 0) {
                            alistgetted = await mysqli.game_query(` SELECT count(*) as count FROM bonuspacks_getted WHERE pid = '${player}' AND packid = 'a${achiev}packe' `);
                            if(alistgetted[0].count == 0){
                                mysqli.game_query(` INSERT INTO bonuspacks_getted ( uid, pid, packid ) VALUES('${player}', '${player}', 'a${achiev}packe' ) `);
                                givedc++;
                            }
                        }
                        if (givedc > 0) {
                            return 'rewardgived';
                        }
                        return 'noreward';
                        break;

                    case 9:
                        let lvl = await mysqli.game_query(`SELECT exp FROM players WHERE account_id = '${user.id}' AND id = '${player}'`);
                        
                        if (getLvl(lvl[0].exp) >= el.reward_a && el.reward_a != 0) {
                            alistgetted = await mysqli.game_query(` SELECT count(*) as count FROM bonuspacks_getted WHERE pid = '${player}' AND packid = 'a${achiev}packa' `);
                            if(alistgetted[0].count == 0){
                                mysqli.game_query(` INSERT INTO bonuspacks_getted ( uid, pid, packid ) VALUES('${player}', '${player}', 'a${achiev}packa' ) `);
                                givedc++;
                            }
                        }
                        if (getLvl(lvl[0].exp) >= el.reward_b && el.reward_b != 0) {
                            alistgetted = await mysqli.game_query(` SELECT count(*) as count FROM bonuspacks_getted WHERE pid = '${player}' AND packid = 'a${achiev}packb' `);
                            if(alistgetted[0].count == 0){
                                mysqli.game_query(` INSERT INTO bonuspacks_getted ( uid, pid, packid ) VALUES('${player}', '${player}', 'a${achiev}packb' ) `);
                                givedc++;
                            }
                        }
                        if (getLvl(lvl[0].exp) >= el.reward_c && el.reward_c != 0) {
                            alistgetted = await mysqli.game_query(` SELECT count(*) as count FROM bonuspacks_getted WHERE pid = '${player}' AND packid = 'a${achiev}packc' `);
                            if(alistgetted[0].count == 0){
                                mysqli.game_query(` INSERT INTO bonuspacks_getted ( uid, pid, packid ) VALUES('${player}', '${player}', 'a${achiev}packc' ) `);
                                givedc++;
                            }
                        }

                        if (givedc > 0) {
                            return 'rewardgived';
                        }
                        return 'noreward';
                    
                        break;
                    case 10:
                        maxcount = await mysqli.game_query(` SELECT complete_count FROM player_quests WHERE player_id = '${player}' AND quest_id = '28305' `);

                        if (maxcount[0].complete_count >= el.reward_a && el.reward_a != 0) {
                            alistgetted = await mysqli.game_query(` SELECT count(*) as count FROM bonuspacks_getted WHERE pid = '${player}' AND packid = 'a${achiev}packa' `);
                            if(alistgetted[0].count == 0){
                                mysqli.game_query(` INSERT INTO bonuspacks_getted ( uid, pid, packid ) VALUES('${player}', '${player}', 'a${achiev}packa' ) `);
                                givedc++;
                            }
                        }    
                        if (givedc > 0) {
                            return 'rewardgived';
                        }
                        return 'noreward';
                        break;
                    case 11:
                        maxcount = await mysqli.game_query(` SELECT complete_count FROM player_quests WHERE player_id = '${player}' AND quest_id = '18811' `);

                        if (maxcount[0].complete_count >= el.reward_a && el.reward_a != 0) {
                            alistgetted = await mysqli.game_query(` SELECT count(*) as count FROM bonuspacks_getted WHERE pid = '${player}' AND packid = 'a${achiev}packa' `);
                            if(alistgetted[0].count == 0){
                                mysqli.game_query(` INSERT INTO bonuspacks_getted ( uid, pid, packid ) VALUES('${player}', '${player}', 'a${achiev}packa' ) `);
                                givedc++;
                            }
                        }    
                        if (givedc > 0) {
                            return 'rewardgived';
                        }
                        return 'noreward';
                        break;
                    case 12:
                        maxcount = await mysqli.game_query(` SELECT complete_count FROM player_quests WHERE player_id = '${player}' AND quest_id = '18305' `);

                        if (maxcount[0].complete_count >= el.reward_a && el.reward_a != 0) {
                            alistgetted = await mysqli.game_query(` SELECT count(*) as count FROM bonuspacks_getted WHERE pid = '${player}' AND packid = 'a${achiev}packa' `);
                            if(alistgetted[0].count == 0){
                                mysqli.game_query(` INSERT INTO bonuspacks_getted ( uid, pid, packid ) VALUES('${player}', '${player}', 'a${achiev}packa' ) `);
                                givedc++;
                            }
                        }
                        if (givedc > 0) {
                            return 'rewardgived';
                        }
                        return 'noreward';
                        break;
                    case 13:
                        maxcount = await mysqli.game_query(` SELECT complete_count FROM player_quests WHERE player_id = '${player}' AND quest_id = '28811' `);

                        if (maxcount[0].complete_count >= el.reward_a && el.reward_a != 0) {
                            alistgetted = await mysqli.game_query(` SELECT count(*) as count FROM bonuspacks_getted WHERE pid = '${player}' AND packid = 'a${achiev}packa' `);
                            if(alistgetted[0].count == 0){
                                mysqli.game_query(` INSERT INTO bonuspacks_getted ( uid, pid, packid ) VALUES('${player}', '${player}', 'a${achiev}packa' ) `);
                                givedc++;
                            }
                        }
                        if (givedc > 0) {
                            return 'rewardgived';
                        }
                        return 'noreward';
                        break;
                    case 14: 
                        maxcount = await mysqli.game_query(` SELECT max_rank FROM abyss_rank WHERE player_id = '${player}' `);

                        if (maxcount[0].max_rank >= 9) {
                            alistgetted = await mysqli.game_query(` SELECT count(*) as count FROM bonuspacks_getted WHERE pid = '${player}' AND packid = 'a${achiev}packa' `);
                            if(alistgetted[0].count == 0){
                                mysqli.game_query(` INSERT INTO bonuspacks_getted ( uid, pid, packid ) VALUES('${player}', '${player}', 'a${achiev}packa' ) `);
                                givedc++;
                            }
                        }
                        if (givedc > 0) {
                            return 'rewardgived';
                        }
                        return 'noreward';
                        break;
                    case 15: 
                        maxcount = await mysqli.game_query(` SELECT max_rank FROM abyss_rank WHERE player_id = '${player}' `);

                        if (maxcount[0].max_rank >= 10) {
                            alistgetted = await mysqli.game_query(` SELECT count(*) as count FROM bonuspacks_getted WHERE pid = '${player}' AND packid = 'a${achiev}packa' `);
                            if(alistgetted[0].count == 0){
                                mysqli.game_query(` INSERT INTO bonuspacks_getted ( uid, pid, packid ) VALUES('${player}', '${player}', 'a${achiev}packa' ) `);
                                givedc++;
                            }
                        }
                        if (givedc > 0) {
                            return 'rewardgived';
                        }
                        return 'noreward';
                        break;
                }

                break;
        }
    },
    async mbonus(query, user_id){
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) {
            throw `access denied`;
        }

        query = JSON.parse(query.json);
        let bpack    = query.bpack;
        let bplayer  = query.bplayer;

        let pl = await mysqli.game_query(`
            SELECT count(id) as count FROM players WHERE account_id = '${user.id}' and id = '${~~bplayer}'
        `);

        if (pl[0].count != 1) {
            return '';
        }

        let bp = await mysqli.pow_query(` SELECT * FROM bonuspacks WHERE pack_name like 'bpack%' ORDER BY pack_name `);
        let bpacks = {}

        for (let key in bp) {
            let el = bp[key];
            if (bpacks[el.pack_name] == undefined) {
                bpacks[el.pack_name] = true;
            }
        }


        let bpg = await mysqli.game_query(` SELECT * FROM bonuspacks_getted WHERE uid = '${user.pow_user_id}'`);
        let bgetted = {}

        for (let kkc in bpg) {
            let el = bpg[kkc];
            if (bgetted[el.packid] == undefined) {
                bgetted[el.packid] = [];
            }
            bgetted[el.packid] = el.is_given;
        }


        let bpr = await mysqli.pow_query(` SELECT * FROM bonuspacks_price`);
        let bprice = {}
        for (let kk in bpr) {
            let el = bpr[kk];
            if (bprice[el.name] == undefined) {
                bprice[el.name] = [];
            }
            bprice[el.name] = el.bmoney;
        }

        if (bpacks[bpack] && (bgetted[bpack] != '1' || bgetted[bpack] != '0') && user.bmoney >= bprice[bpack]) {
            await mysqli.game_query(`INSERT INTO bonuspacks_getted ( uid, pid, packid ) VALUES('${user.pow_user_id}','${bplayer}', '${bpack}' )`);
            return true;
        }
        throw "nobonus";
    }

};

async function checkaccesscode(user, code){
    if (!code.match(/(?=^.{8,}$)((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/)) { 
        return false;
    }

    let ch = await mysqli.pow_query( `SELECT is_active FROM access_codes WHERE login = '${user.name}' AND access_code = '${code}'` );
    ch = ch[0];
    console.log(ch.is_active);
    if (ch.is_active == 'true') {
        await mysqli.pow_query( `UPDATE access_codes SET is_active = 'false' WHERE login = '${user.name}'` );
        return true;
    }
    return false;
}


function getLvl(exp) {
    if (exp < '650') { return '1'; }
    if (exp < '2567') { return '2'; }
    if (exp < '6797') { return '3'; }
    if (exp < '15490') { return '4'; }
    if (exp < '30073') { return '5'; }
    if (exp < '52958') { return '6'; }
    if (exp < '87894') { return '7'; }
    if (exp < '140329') { return '8'; }
    if (exp < '213454') { return '9'; }
    if (exp < '307558') { return '10'; }
    if (exp < '438553') { return '11'; }
    if (exp < '608161') { return '12'; }
    if (exp < '825336') { return '13'; }
    if (exp < '1091985') { return '14'; }
    if (exp < '1418170') { return '15'; }
    if (exp < '1810467') { return '16'; }
    if (exp < '2332547') { return '17'; }
    if (exp < '3002260') { return '18'; }
    if (exp < '3820082') { return '19'; }
    if (exp < '4820229') { return '20'; }
    if (exp < '6115323') { return '21'; }
    if (exp < '7665200') { return '22'; }
    if (exp < '9667124') { return '23'; }
    if (exp < '12015782') { return '24'; }
    if (exp < '14702523') { return '25'; }
    if (exp < '17819939') { return '26'; }
    if (exp < '21422200') { return '27'; }
    if (exp < '25434736') { return '28'; }
    if (exp < '30111208') { return '29'; }
    if (exp < '35939440') { return '30'; }
    if (exp < '42747682') { return '31'; }
    if (exp < '50838806') { return '32'; }
    if (exp < '60528213') { return '33'; }
    if (exp < '73197342') { return '34'; }
    if (exp < '89321807') { return '35'; }
    if (exp < '109063829') { return '36'; }
    if (exp < '135085670') { return '37'; }
    if (exp < '165021833') { return '38'; }
    if (exp < '201169803') { return '39'; }
    if (exp < '243343723') { return '40'; }
    if (exp < '292699203') { return '41'; }
    if (exp < '350659083') { return '42'; }
    if (exp < '415031452') { return '43'; }
    if (exp < '485413854') { return '44'; }
    if (exp < '559280864') { return '45'; }
    if (exp < '643809037') { return '46'; }
    if (exp < '741317548') { return '47'; }
    if (exp < '853743989') { return '48'; }
    if (exp < '982653882') { return '49'; }
    if (exp < '1128723920') { return '50'; }
    if (exp < '1274793948') { return '51'; }
    if (exp < '1452258716') { return '52'; }
    if (exp < '1656513717') { return '53'; }
    if (exp < '1892999481') { return '54'; }
    if (exp < '2164391835') { return '55'; }
    if (exp < '2398328592') { return '56'; }
    if (exp < '2696122834') { return '57'; }
    if (exp < '3026674442') { return '58'; }
    if (exp < '3393586726') { return '59'; }
    if (exp < '38008593610') { return '60'; }
    if (exp < '4072726355') { return '61'; }
    if (exp < '4584358478') { return '62'; }
    if (exp < '4995469589') { return '63'; }
    if (exp < '5480570690') { return '64'; }
    if (exp <= '5892783702') { return '65'; }
    return '65+';
}





