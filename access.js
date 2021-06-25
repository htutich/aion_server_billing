module.exports = {
    selfRight(worker, target) {
        if (worker.type == target.type && worker.id == target.id) {
            return true;
        }
        return false;
    },
    isEnoughParameters(get_data, params) {
        let result = [];
        params.forEach(field => {
            if (get_data[field] == undefined) throw `need ${field}`;
            result.push(get_data[field]);
        });
        return result;
    },
    generatePassword() {
        var length = 8,
            charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
            retVal = "";
        for (var i = 0, n = charset.length; i < length; ++i) {
            retVal += charset.charAt(Math.floor(Math.random() * n));
        }
        return retVal;
    }
};
