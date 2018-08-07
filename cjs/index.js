"use strict";

var parser = require("./src/parser");
var accountHistoryApi = require("./src/api/getAccountHistory")(true);

module.exports = {
  parser: parser,
  accountHistoryApi: accountHistoryApi
};
