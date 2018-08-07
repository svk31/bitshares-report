const {groupEntries, parseData} = require("./src/parser");
const {resolveBlockTimes, resolveAssets} = require("./src/api/nodeApi");
const {
    getAccountHistoryES,
    getAccountHistory
} = require("./src/api/getAccountHistory")(true);

module.exports = {
    groupEntries,
    parseData,
    getAccountHistoryES,
    getAccountHistory,
    resolveBlockTimes,
    resolveAssets
};
