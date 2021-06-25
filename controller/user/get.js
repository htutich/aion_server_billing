const Worker = require(`../../model/worker`);
const User = require(`../../model/user`);
const ACCESS = require(`../../access`);
const crypto = require('crypto');
const md5 = require('md5');
const mysqli = require(`../../mysqli`);
const core = require(`../../core`);
const nodemailer = require("nodemailer");
const fetch = require("node-fetch");
const https = require(`https`);
const fs = require('fs');
const http = require(`http`);
var request = require('request');


var download = function(uri, filename, callback){
  request.head(uri, function(err, res, body){
    //console.log('content-type:', res.headers['content-type']);
    //console.log('content-length:', res.headers['content-length']);

    request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
  });
};
let EmailT = nodemailer.createTransport({
    host: core.email.host,
    port: core.email.port,
    secure: core.email.secure,
    auth: {
        user: core.email.user,
        pass: core.email.pass
    }
});

let vknews = {
    dateupdate: 0,
};
let topplayers = {
    dateupdate: 0,
};
let toplegions = {
    dateupdate: 0,
};
let onlinecount = {
    dateupdate: 0,
};
let playerchars = {
    dateupdate: 0,
};


let globalobj = {}

module.exports = {

    async main(query, user_id) {
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) {
            throw `access denied`;
        }

        let data = {
            id: user.id,
            name: user.name,
            activated: user.activated,
            access_level: user.access_level,
            expire: (Date.parse(user.expire) > new Date().getTime())?true:false,
            expire_date: user.expire,
            toll: user.toll,
            email: user.email,
            money: user.money,
            bmoney: user.bmoney,
            race: user.race,
            login_log: user.login_log,
            hdd_control: user.hdd_control,
            hddsc: user.hddsc
        }

        globalobj[token] = data
        return globalobj[token];
    },
    async unit_payment(query, user_id){
        let u = {
            secretKey: core.unitpay.secretKey,
            publicKey: core.unitpay.publicKey
        }

        let ip = query.ip.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);

        let uips = new Array ('31.186.100.49','178.132.203.105','52.29.152.23','52.19.56.234')
        let method = query.method;
        let params = query;
        delete params.method;
        delete params.ip;

        let sign = getSignature(params, method, u.secretKey);
        if(uips.indexOf(ip[0]) == -1){ throw `bad payment ip`;}
        if (sign != query['params[signature]']) { throw `bad payment signature`; }

        if (method == 'pay') {

            let curMoney = ~~query['params[orderSum]'];
            let sql_text_add = `UPDATE users SET money = money + ${curMoney} WHERE login = '${query['params[account]']}'`;
            await mysqli.pow_query(sql_text_add);

            let sql_text_add_log = `
            INSERT INTO unitpay_payments 
            (unitpayId, account, sum, itemsCount, dateComplete, status) VALUES 
            ('${query['params[unitpayId]']}',  '${query['params[account]']}', '${query['params[orderSum]']}', '${curMoney}', now(), '1')`;
            await mysqli.pow_query(sql_text_add_log);

            return new Object({"result": {
                "message": `add ${curMoney} to ${query['params[account]']}`
            }})
        }

        if (method == 'check') {
            return new Object({"result": {
                "message": `check успешен`
            }})
        }
    },
    async robo_payment(query) {

        switch (query.action) {
            case 'url':

                let data = {
                    'OutSum': query.OutSum,
                    'Shp_account': query.Shp_account,
                    'Desc': query.Desc,
                    'SignatureValue': md5(`${core.robokassa.merchantLogin}:${query.OutSum}::${core.robokassa.password1}:Shp_account=${query.Shp_account}`)
                }

                return `https://auth.robokassa.ru/Merchant/Index.aspx?MrchLogin=${core.robokassa.merchantLogin}&OutSum=${query.OutSum}&Shp_account=${query.Shp_account}&Desc=${query.Desc}&SignatureValue=${data.SignatureValue}`;

                break;
            default:

                let NewHash = md5(`${query.OutSum}:${query.InvId}:${core.robokassa.password2}:Shp_account=${query.Shp_account}`);

                if (query.SignatureValue.toUpperCase() == NewHash.toUpperCase()) {
                    await mysqli.pow_query( `UPDATE users SET money = money + ${query.OutSum}, bmoney = bmoney + ${query.OutSum} WHERE id = '${query.Shp_account}'` );
                    return `ok`;
                }
                return `false`;

                break;
        }

    },
    async logout(query, user_id){
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);

        if (!worker.isEqual(user)) {
            throw `access denied`;
        }
        await mysqli.pow_query( `UPDATE session_codes SET is_active = false WHERE code = '${query.token}' and user_fk = '${user.id}'` );

        return new Object({
            "success": true,
            "result": {"message": `logout success`}
        })
    },
    async logoutall(query, user_id){
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) {
            throw `access denied`;
        }
        await mysqli.pow_query( `UPDATE session_codes SET is_active = false WHERE user_fk = '${user.id}'` );

        return new Object({
            "success": true,
            "result": {"message": `logout all success`}
        })
    },
    async getaccesscode(query, user_id) {
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) {
            throw `access denied`;
        }
        let code = ACCESS.generatePassword();
        await mysqli.pow_query( `UPDATE access_codes SET is_active = 'false' WHERE login = '${user.name}'` );
        await mysqli.pow_query( `INSERT INTO access_codes ( login, access_code, is_active ) VALUES('${user.name}','${code}', 'true' )` );


        let info = await EmailT.sendMail({
            from: `"${core.email.nsender}" <${core.email.sender}>`,
            to: `${user.email}`,
            subject: "Код подтверждения",
            text: "Ваш код подтверждения: " + code,
            html: `Ваш код подтверждения:  <b>${code}</b>`
        });

        globalobj[token] = new Object({ "message": `code send` })
        return globalobj[token];
    },
    async membershiplist(){
        let res = await mysqli.pow_query( `SELECT id, name, price FROM membership` );
        return res;
    },
    async vknews(){

        if (vknews.dateupdate < Date.now()) {
            vknews = {
                dateupdate: Date.now() + (core.caching.vknews * 1000),
                response: await fetch(`https://api.vk.com/method/wall.get?owner_id=${core.vk.groupid}&v=5.8&access_token=${core.vk.access_token}&count=${core.vk.count}&filter=owner`).then(response => response.json())
            }
        }
        return vknews;

    },
    async player(query, user_id){
        let username = user_id.replace(/\W/iu, '');

        if (!username) { 
            throw "empty username";
        }

        if (!username.match(/^[a-zA-Z0-9]{1,32}$/)) { 
            throw "bad username";
        }

        let result = await mysqli.game_query( 
            ` SELECT count(p.account_id) as count, p.account_id, p.id, p.name, exp, gender, race, player_class, online, world_id, title_id, creation_date, last_online,
            daily_ap, daily_kill, weekly_ap, ap, weekly_kill, all_kill, a.rank,
            hp, mp, l.name AS legion, lm.rank AS legion_rank
            FROM players p
            LEFT JOIN abyss_rank a ON a.player_id=p.id
            LEFT JOIN player_life_stats ls ON ls.player_id=p.id
            LEFT JOIN legion_members lm ON lm.player_id = p.id
            LEFT JOIN legions l ON l.id=lm.legion_id
            WHERE p.name = '${username}' limit 1` );
        result = result[0];


        if (result.count == 1) {
            let vip = await mysqli.login_query(`SELECT expire FROM account_data WHERE id = '${result.account_id}'`)
            vip = vip[0];
    
            let data = {
                name: result.name,
                exp: result.exp,
                player_class: result.player_class,
                race: result.race,
                all_kill: result.all_kill,
                ap: result.ap,
                online: result.online,
                legion: result.legion,
                expire: (Date.parse(vip.expire) > new Date().getTime())?true:false,
            }
            return data;

        }
        throw 'noplayer';

    },
    async top(query, user_id){
        let result;

        switch (user_id) {
            case "players":

                if (topplayers.dateupdate < Date.now()) {
                    topplayers = {
                        dateupdate: Date.now() + (core.caching.topplayers * 1000),
                        response: await mysqli.game_query( 
                            ` SELECT p.name, exp, race, player_class, online, ap, all_kill,
                            (SELECT COUNT(*) FROM players) AS count 
                            FROM players p
                            LEFT JOIN abyss_rank ar ON ar.player_id = p.id
                            WHERE exp > '650'
                            ORDER BY all_kill DESC LIMIT 50
                            `)
                    }
                }
                
                return topplayers.response;
                break;

            case "legions":

                if (toplegions.dateupdate < Date.now()) {
                    toplegions = {
                        dateupdate: Date.now() + (core.caching.toplegions * 1000),
                        response: await mysqli.game_query( `
                        SELECT l.name, contribution_points, level, p.name AS legat, race,
                        (SELECT COUNT(*) FROM legion_members WHERE legion_members.legion_id = l.id) AS members_count,
                        (SELECT COUNT(*) FROM legions) AS count
                        FROM legions l
                        LEFT JOIN legion_members m ON m.legion_id = l.id AND m.rank = "BRIGADE_GENERAL"
                        LEFT JOIN players p ON p.id = m.player_id
                        ORDER BY contribution_points DESC LIMIT 50
                        ` )
                    }
                }
                
                return toplegions.response;
                break;
        }

    },
    async onlinecount(){

        if (onlinecount.dateupdate < Date.now()) {
            onlinecount = {
                dateupdate: Date.now() + (core.caching.vknews * 1000),
                response: await mysqli.game_query( 
                    ` SELECT COUNT(*) AS total,
                    (SELECT COUNT(*) FROM players WHERE online = 1) AS total_online,
                    (SELECT COUNT(*) FROM players WHERE race = "ASMODIANS" AND online = 1) AS online_asmo,
                    (SELECT COUNT(*) FROM players WHERE race = "ELYOS" AND online = 1) AS online_ely
                    FROM players
                    `)
            }
        }

        let online_asmo = ~~(onlinecount.response[0].online_asmo * core.global.onlinemultiplier);
        let online_ely = ~~(onlinecount.response[0].online_ely * core.global.onlinemultiplier);
        let total_online = online_asmo + online_ely;

        let data = {
            total_online: total_online,
            online_asmo: online_asmo,
            online_ely: online_ely,
        }

        return data;

    },
    async getmmotop(query, user_id){
        try {
            let [token] = ACCESS.isEnoughParameters(query, [`token`]);
            let worker = await Worker(token);
            let user = await User(user_id);
            if (!worker.isEqual(user)) {
                throw `access denied`;
            }
            
            let mmotopcfg = await mysqli.pow_query(` SELECT mmotopru_link, mmotopru_bonus FROM settings_votes`);
            let promise = new Promise(function(resolve, reject) {
                https.get(mmotopcfg[0].mmotopru_link, (resp) => {
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

            let mmotop = await promise;

            let lastVotesDb = await mysqli.pow_query(`SELECT account_id, MAX(date) as date FROM log_votes WHERE rating = 'MMOTOPRU' AND user_id = '${user.pow_user_id}' group by account_id`);
            let getaccdate = await mysqli.login_query(`SELECT name, last_ip, last_hdd FROM account_data WHERE pow_user_id = ${user.pow_user_id}`);
            let votelog = await mysqli.pow_query(`SELECT count(*) as count FROM account_voting WHERE account_login!='${getaccdate[0].name}' and account_hdd='${getaccdate[0].last_hdd}' and DATE(NOW()) = DATE(vdate)`);
            let votes = {};

            if (votelog[0].count > 0) {
                throw `Invalid`;
            }

            let lastVotes = undefined, lastVote = undefined;
            for (let key in lastVotesDb) {
                if (lastVotesDb.hasOwnProperty(key)) {
                    let el = lastVotesDb[key];
                    lastVotes = {}
                    lastVotes[el.account_id] = el.date;
                }
            }

            mmotop = mmotop.split('\n');

            for (let kk in mmotop) {
                if (mmotop.hasOwnProperty(kk)) {
                    let el = mmotop[kk];
                    el = el.split('\t');

                    if (el[1] == undefined) {
                        continue;
                    }

                    let name = el[3];
                    let date = Date.parse(el[1] + ` GMT`)/1000;
                    let type = el[4];
                    let day = date;


                    if (name == user.name) {

                        
                        if (lastVotes != undefined) {
                            lastVote = lastVotes[user.pow_user_id];
                        } else {
                            lastVote = Date.parse(0);
                        }
                        console.log(lastVote);
                        console.log(date);

                        if (lastVote < date) {

                            votes[day] = {}
                            votes[day][name] = {}

                            votes[day][name]['account_name'] = name;
                            votes[day][name]['account_id'] = user.pow_user_id;
                            votes[day][name]['user_id'] = user.pow_user_id;
                            votes[day][name]['type'] = type;
                            votes[day][name]['date'] = date;
                            continue;
                        }
                        continue;
                    }

                }

            }

            let i = 0;
            for (let vcc in votes) {
                if (votes.hasOwnProperty(vcc)) {
                    let array = votes[vcc];

                    for (let nnn in array) {
                        if (array.hasOwnProperty(nnn)) {
                            let data = array[nnn];
                            await mysqli.pow_query(`
                                INSERT INTO log_votes ( account_id, completed, date, rating, type, user_id) 
                                VALUES ( '${data['account_id']}', '${new Date().getTime()/1000}', '${data['date']}', 'MMOTOPRU', '${data['type']}', '${data['user_id']}' );
                            `)
                            ++i;
                        }
                    }
                }
            }

            let money = mmotopcfg[0].mmotopru_bonus * i;
            await mysqli.pow_query(`UPDATE users SET money = money + '${money}' WHERE id = '${user.pow_user_id}'`);

            if (i > 0) {
                await mysqli.pow_query(`
                    INSERT INTO account_voting ( account_hdd, account_ip, account_login, vdate) VALUES 
                    ( '${getaccdate[0]['last_hdd']}', '${getaccdate[0]['last_ip']}', '${getaccdate[0]['name']}', now())
                `);
                return money;
            } else {
                throw `novotes`;
            }
        } catch (error) {
            throw error;
        }
    },
    async chars(query, user_id) {
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) {
            throw `access denied`;
        }

        let chars = await mysqli.game_query(`SELECT p.id, p.name FROM players p WHERE account_id = '${user.id}'`);
        
        globalobj[token] = chars
        return globalobj[token];
    },
    async playerchars(query, user_id){
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) {
            throw `access denied`;
        }
        if (playerchars.dateupdate < Date.now()) {
            playerchars = {
                dateupdate: Date.now() + (core.caching.playerchars * 1000),
                response: await mysqli.game_query( 
                    ` SELECT p.name, exp, race, player_class, online, ap, all_kill
                    FROM players p
                    LEFT JOIN abyss_rank ar ON ar.player_id = p.id
                    WHERE exp > '0' AND p.account_id = '${user.id}'
                    ORDER BY all_kill DESC LIMIT 50
                    `)
            }
        }
        
        return playerchars.response;
    },
    async mbonus(query, user_id){
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) {
            throw `access denied`;
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

        let bp = await mysqli.pow_query(` SELECT * FROM bonuspacks WHERE pack_name LIKE 'bpack%' ORDER BY pack_name `);
        let bpr = await mysqli.pow_query(` SELECT * FROM bonuspacks_price`);
        let bpg = await mysqli.game_query(` SELECT * FROM bonuspacks_getted WHERE uid = '${user.pow_user_id}'`);
        let bpacks = {}
        let bprice = {}
        let bgetted = {}

        for (let key in bp) {
            let el = bp[key];
            if (bpacks[el.pack_name] == undefined) {
                bpacks[el.pack_name] = [];
            }

            let bmp = {
                item_id: el.item_id,
                count: el.count,
                pack_name: el.pack_name,
                html: await gethtml(el.item_id, el.html)
            }
            bpacks[el.pack_name].push(bmp);
        }

        for (let kk in bpr) {
            let el = bpr[kk];
            if (bprice[el.name] == undefined) {
                bprice[el.name] = [];
            }
            bprice[el.name] = el.bmoney;
        }

        for (let kkc in bpg) {
            let el = bpg[kkc];
            if (bgetted[el.packid] == undefined) {
                bgetted[el.packid] = [];
            }
            bgetted[el.packid] = el.is_given;
        }

        let data = {
            bpacks: bpacks,
            bprice: bprice,
            bgetted: bgetted
        }
        return data;

    }

};

function getSignature(params, method, secretKey) {
    let keys = Object.keys(params).sort();
    removeArrayValue(keys, 'params[signature]')
    let data = [];
    data.push(method);
    keys.forEach(v => data.push(params[v]));
    data.push(secretKey);
    return hash(data.join('{up}'), 'sha256');
}

function hash(data, hash = 'sha256') {
	return crypto.createHash(hash)
		.update(data)
        .digest('hex');
}

function removeArrayValue(arr, value) {
	let index = arr.indexOf(value);
	if (index >= 0) {
		arr.splice( index, 1 );
	}

	return arr;
}
