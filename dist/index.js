"use strict";

var _require = require("./src/parser"),
  groupEntries = _require.groupEntries,
  parseData = _require.parseData;

var _require2 = require("./src/api/getAccountHistory")(true),
  getAccountHistoryES = _require2.getAccountHistoryES,
  getAccountHistory = _require2.getAccountHistory;

module.exports = {
  groupEntries: groupEntries,
  parseData: parseData,
  getAccountHistoryES: getAccountHistoryES,
  getAccountHistory: getAccountHistory
};
