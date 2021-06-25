const mysqli = require(`../mysqli`);

const getTypeId = (type) => ({
    1: 'user'
})[type] || 0;

module.exports = async (token) => {

    let session_codes = await mysqli.pow_query(`SELECT count(*) as count, user_fk FROM session_codes where code = '${token}' AND is_active = true`);
    session_codes = session_codes[0];
    let account_data = await mysqli.login_query(`SELECT activated FROM account_data where id = '${session_codes.user_fk}'`);
    account_data = account_data[0];

    if (session_codes.count != 1) { throw `invalid token`; }
    this.id = ~~session_codes.user_fk;
    this.type_id = ~~account_data.activated;
    this.type = getTypeId(this.type_id);

    this.isEqual = (any_entity) => {
        return (~~this.type_id == ~~any_entity.type_id) && (~~this.id == ~~any_entity.id) && (~~any_entity.activated == ~~any_entity.type_id);
    };
    this.isUser = () => {
        return this.type == `user`;
    };
    return this;
};
