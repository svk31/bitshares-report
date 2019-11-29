const {ChainStore} = require("bitsharesjs");

function precisionToRatio(p) {
    if (typeof p !== "number") throw new Error("Input must be a number");
    return Math.pow(10, p);
}

function parseCurrency(amount) {
    let asset = ChainStore.getAsset(amount.asset_id);
    if (asset) asset = asset.toJS();
    else {
        asset = {
            precision: 5
        };
    }
    let precisionRatio = precisionToRatio(asset.precision);
    let fullAmount = amount.amount / precisionRatio;
    return {
        amount: fullAmount,
        currency: asset.symbol,
        asset_id: amount.asset_id
    };
}

function printAmount(amount) {
    if (!amount.amount || !amount.currency) return "";
    let asset = ChainStore.getAsset(amount.asset_id);
    if (asset) asset = asset.toJS();
    else {
        asset = {
            precision: 5
        };
    }
    return amount.amount.toFixed(asset.precision);
}

function getIndex(str) {
    let pieces = str.split(".");
    return parseInt(pieces[2], 10);
}

module.exports = {
    parseCurrency,
    printAmount,
    getIndex
};
