"use strict";

var _require = require("bitsharesjs"),
  ChainStore = _require.ChainStore;

function precisionToRatio(p) {
  if (typeof p !== "number") throw new Error("Input must be a number");
  return Math.pow(10, p);
}

function parseCurrency(amount) {
  var asset = ChainStore.getAsset(amount.asset_id);
  if (asset) asset = asset.toJS();
  else {
    asset = { precision: 5 };
  }
  var precisionRatio = precisionToRatio(asset.precision);

  var fullAmount = amount.amount / precisionRatio;
  return {
    amount: fullAmount,
    currency: asset.name,
    asset_id: amount.asset_id
  };
}

function printAmount(amount) {
  if (!amount.amount || !amount.currency) return "";
  var asset = ChainStore.getAsset(amount.asset_id);
  if (asset) asset = asset.toJS();
  else {
    asset = { precision: 5 };
  }

  return amount.amount.toFixed(asset.precision);
}

function getIndex(str) {
  var pieces = str.split(".");
  return parseInt(pieces[2], 10);
}

module.exports = {
  parseCurrency: parseCurrency,
  printAmount: printAmount,
  getIndex: getIndex
};
