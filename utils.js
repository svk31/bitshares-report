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

function precisionToRatio(p) {
    if (typeof p !== "number") throw new Error("Input must be a number");
    return Math.pow(10, p);
}

function getIndex(str) {
    let pieces = str.split(".");
    return parseInt(pieces[2], 10);
}

module.exports = {
    parseCurrency,
    printAmount,
    precisionToRatio,
    getIndex
}
