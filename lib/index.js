const { groupEntries, parseData } = require("./src/parser");
const {
  getAccountHistoryES,
  getAccountHistory
} = require("./src/api/getAccountHistory")(true);

module.exports = {
  groupEntries,
  parseData,
  getAccountHistoryES,
  getAccountHistory
};
