const Worker = require(`../../model/worker`);
const User = require(`../../model/user`);
const ACCESS = require(`../../access`);
const crypto = require('crypto');
const mysqli = require(`../../mysqli`);
const core = require(`../../core`);
const nodemailer = require("nodemailer");
const fetch = require("node-fetch");
const http = require(`http`);
const fs = require('fs');


module.exports = {
    
    async add(query, user_id){
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) { throw `access denied`; }
        if (user.race == undefined) { throw `norace`; }
        query = JSON.parse(query.json);
        
        if (crypto.createHash('sha1').update(query.newlotpass).digest("base64") != user.password) {
            return 14;
        }

        if (~~query.newlotc % 1000000 > 0) {
            return 10;
        }

        if (~~query.newlotc < 1000000) {
            return 10;
        }


        if (~~query.newlotpl < 1) {
            return 9;
        }

        if (~~query.newlotc > 1000000000) {
            return 12;
        }
        let steppl = new Intl.NumberFormat().format(Number(parseFloat(~~query.newlotp / (~~query.newlotc/1000000)).toFixed(1)));
        if (steppl < parseFloat(2,0)) {
            return 15;
        }

        let co = await mysqli.game_query(`
            SELECT count(ka.id) as count
            FROM kinah_auction ka
            LEFT JOIN players p ON p.id = ka.player_id
            WHERE ka.account_id = '${user.id}'
        `);

        if (co.count >= 5) {
            return 11;
        }

        let eco = await mysqli.game_query(`
            SELECT DATE_ADD(register_time, INTERVAL 10 SECOND) as register_time
            FROM kinah_auction ka
            LEFT JOIN players p ON p.id = ka.player_id
            WHERE ka.account_id = '${user.id}' order by ka.id desc limit 1
        `);

        if (eco.length > 0 && (Date.parse(eco[0].register_time + ` GMT`) > Date.parse(new Date() + ` GMT`))) {
            return 13;
        }

        let pl = await mysqli.game_query(`
            SELECT count(id) as count FROM players WHERE account_id = '${user.id}' and id = '${~~query.newlotpl}'
        `);

        if (pl[0].count != 1) {
            return '';
        }

        let data = [
            query.newlotpl,
            query.newlotc,
            ~~query.newlotp,
            steppl.replace(',',''),
            user.pow_user_id
        ]

        let url = core.kinah.createlot + `?` + data.join('&')


        let promise = new Promise(function(resolve, reject) {
            http.get(url, (resp) => {
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

        let apikinah = await promise;

        return ~~apikinah;

    },
    async buy(query, user_id){
        try {
            let [token] = ACCESS.isEnoughParameters(query, [`token`]);
            let worker = await Worker(token);
            let user = await User(user_id);
            if (!worker.isEqual(user)) { throw `access denied`; }
            if (user.race == undefined) { throw `norace`; }
            query = JSON.parse(query.json);

            if (crypto.createHash('sha1').update(query.password).digest("base64") != user.password) {
                return 14;
            }
    
            let lotid = ~~query.lotid;
            let s = await mysqli.game_query(` select ka.account_id from players p left join kinah_auction ka ON ka.player_id = p.id where ka.id = '${lotid}'`);
            let fulllot = await mysqli.game_query(` select * from kinah_auction where id = '${lotid}'`);
    
            /**
             * let sb - продавец
             */
            let sb = await mysqli.login_query(` select pow_user_id from account_data where id = '${s[0].account_id}'`);
            sb = sb[0];
    
            let data = [
                lotid,
                ~~query.char,
                fulllot[0].kinah_count,
                fulllot[0].price,
            ]
    
            let url = core.kinah.buylot + `?` + data.join('&')
            let promise = new Promise(function(resolve, reject) {
                http.get(url, (resp) => {
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
    
            let apikinah = await promise;
            
            if (~~apikinah == 1) {
                console.log(~~apikinah);
                
                mysqli.pow_query(`UPDATE users SET money = money + '${fulllot[0].price}' WHERE id = '${sb.pow_user_id}'`);
                mysqli.pow_query(`UPDATE users SET money = money - '${fulllot[0].price}' WHERE id = '${user.pow_user_id}'`);
    
                //Кто продал
                mysqli.game_query(`
                    INSERT INTO kinah_auction_log ( a_fk, account_id, kinah_count, lot_id, player_id, price, price_step, register_time, status) 
                    VALUES ( '${sb.pow_user_id}', '${fulllot[0].account_id}', '${fulllot[0].kinah_count}', '${fulllot[0].id}', '${fulllot[0].player_id}', '${fulllot[0].price}', '${fulllot[0].price_step}', '${fulllot[0].register_time}', '0')
                `);
    
                //Кто купил
                mysqli.game_query(`
                    INSERT INTO kinah_auction_log ( a_fk, account_id, kinah_count, lot_id, player_id, price, price_step, register_time, status) 
                    VALUES ( '${user.pow_user_id}', '${fulllot[0].account_id}', '${fulllot[0].kinah_count}', '${fulllot[0].id}', '${fulllot[0].player_id}', '${fulllot[0].price}', '${fulllot[0].price_step}', '${fulllot[0].register_time}', '1')
                `);
    
                return ~~apikinah;
            }
            return ~~apikinah;
        } catch (error) {
            return error
        }

    },
    async cancellot(query, user_id){
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) { throw `access denied`; }
        if (user.race == undefined) { throw `norace`; }
        query = JSON.parse(query.json);

        let co = await mysqli.game_query(`SELECT id, player_id, kinah_count, price FROM kinah_auction WHERE id = '${~~query.lotid}' AND account_id = '${user.id}'`);

        if (co.length < 1) {
            return 2;
        }
        co = co[0];

        let data = [
            co.id,
            co.player_id,
            co.kinah_count,
            co.price
        ]

        let url = core.kinah.cancellot + `?` + data.join('&')

        let promise = new Promise(function(resolve, reject) {
            http.get(url, (resp) => {
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

        let apikinah = await promise;

        return ~~apikinah;

    }

};
