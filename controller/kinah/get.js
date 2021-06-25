const Worker = require(`../../model/worker`);
const User = require(`../../model/user`);
const ACCESS = require(`../../access`);
const crypto = require('crypto');
const mysqli = require(`../../mysqli`);
const core = require(`../../core`);
const nodemailer = require("nodemailer");
const fetch = require("node-fetch");
const https = require(`https`);
const fs = require('fs');


module.exports = {

    async main(query, user_id) {
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) { throw `access denied`; }
        if (user.race == undefined) { throw `norace`; }

        let sort = ``;
        switch (query.sort) {
            case 'priceup': sort = ` order by cast(price_step as DECIMAL(8,2)) desc`; break;
            case 'countup': sort = ` order by kinah_count desc`; break;
            case 'pricedown': sort = ` order by cast(price_step as DECIMAL(8,2)) asc`; break;
            case 'countdown': sort = ` order by kinah_count asc`; break;
            case 'mylots': sort = ` and ka.account_id = '${user.id}'`; break;
        }

        let lots = await mysqli.game_query(`
            SELECT p.race, p.name, ka.id, player_id, kinah_count, price, price_step, ka.account_id
            FROM kinah_auction ka
            LEFT JOIN players p ON p.id = ka.player_id
            WHERE p.race = '${user.race}' ${sort}
        `);

        let mylotscount = await mysqli.game_query(`
            SELECT count(ka.id) as count FROM kinah_auction ka
            LEFT JOIN players p ON p.id = ka.player_id
            WHERE ka.account_id = '${user.id}'
        `);

        return {
            lots: lots,
            mylotscount: mylotscount[0].count,
        };

    },
    async lot(query, user_id){
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) { throw `access denied`; }
        if (user.race == undefined) { throw `norace`; }

        return await mysqli.game_query(`
        SELECT p.race, p.name, ka.id, player_id, kinah_count, price, price_step, ka.account_id
        FROM kinah_auction ka
        LEFT JOIN players p ON p.id = ka.player_id
        WHERE p.race = '${user.race}' and ka.id = '${~~query.lotid}' 
        `);

    },
    async history(query, user_id) {
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) { throw `access denied`; }
        if (user.race == undefined) { throw `norace`; }

        return await mysqli.game_query(`SELECT * FROM kinah_auction_log WHERE a_fk = '${user.pow_user_id}' ORDER BY id DESC`);

    },
    async status(query, user_id) {
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) { throw `access denied`; }
        if (user.race == undefined) { throw `norace`; }

        let status = await mysqli.pow_query(`SELECT kinahAuctionIsActive FROM settings`)

        if(status[0].kinahAuctionIsActive == '1'){
            return true;
        } else {
            throw false;
        }
    },
    async activate(query, user_id) {
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) { throw `access denied`; }
        if (user.race == undefined) { throw `norace`; }
        if (user.access_level >= 5) {
            await mysqli.pow_query(`UPDATE settings SET kinahAuctionIsActive = 1`)
        }
        return true;
    },
    async disable(query, user_id) {
        let [token] = ACCESS.isEnoughParameters(query, [`token`]);
        let worker = await Worker(token);
        let user = await User(user_id);
        if (!worker.isEqual(user)) { throw `access denied`; }
        if (user.race == undefined) { throw `norace`; }
        if (user.access_level >= 5) {
            await mysqli.pow_query(`UPDATE settings SET kinahAuctionIsActive = 0`)
        }
        return true;
    }

};
