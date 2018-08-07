const {getAsset} = require("./api");

function parseCurrency(amount) {
    let asset = getAsset(amount.asset_id);
    let fullAmount = amount.amount / asset.precisionRatio;
    return {
        amount: fullAmount,
        currency: asset.name,
        asset_id: amount.asset_id
    };
}

function printAmount(amount) {
    if (!amount.amount || !amount.currency) return "";
    let asset = getAsset(amount.asset_id);

    return (amount.amount).toFixed(asset.precision);
}

function getIndex(str) {
    let pieces = str.split(".");
    return parseInt(pieces[2], 10);
}

module.exports = {
    parseCurrency,
    printAmount,
    getIndex
}
