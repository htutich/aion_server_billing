const mysqli = require(`../mysqli`);

const User = async (user_id) => {
    this.id = ~~user_id;
    this.type = `user`;
    this.type_id = 1;

    this.update = async () => {
        let res_login = await mysqli.login_query(`SELECT * FROM account_data WHERE id = ${this.id} `);
        res_login = res_login[0];
        Object.assign(this, res_login);

        let res_pow = await mysqli.pow_query(`SELECT email, money, bmoney FROM users WHERE id = ${this.pow_user_id} `);
        res_pow = res_pow[0];
        Object.assign(this, res_pow);

        let res_game = await mysqli.game_query(`SELECT race FROM players WHERE account_id = ${this.id} LIMIT 1`);
        res_game = res_game[0];
        Object.assign(this, res_game);
        
        let hddsc = await mysqli.login_query(`SELECT count(*) as hddsc FROM account_valid_hdd WHERE account_id = '${this.id}'`)
        hddsc = hddsc[0];
        Object.assign(this, hddsc);
    }
    await this.update();
    return this;
}

module.exports = User;
