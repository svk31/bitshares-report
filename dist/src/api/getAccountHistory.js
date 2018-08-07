"use strict";

var bts = require("bitsharesjs-ws");
var fetchClient = void 0;

module.exports = function(isBrowser) {
  if (isBrowser) fetchClient = fetch;
  else {
    fetchClient = require("node-fetch");
  }

  function getAccountHistoryES(account_id, limit, start) {
    var esNode =
      arguments.length > 3 && arguments[3] !== undefined
        ? arguments[3]
        : "https://eswrapper.bitshares.eu";

    console.log(
      "query",
      esNode +
        "/get_account_history?account_id=" +
        account_id +
        "&from_=" +
        start +
        "&size=" +
        limit +
        "&sort_by=block_data.block_time&type=data&agg_field=operation_type"
    );
    return new Promise(function(resolve, reject) {
      fetchClient(
        esNode +
          "/get_account_history?account_id=" +
          account_id +
          "&from_=" +
          start +
          "&size=" +
          limit +
          "&sort_by=block_data.block_time&type=data&agg_field=operation_type"
      )
        .then(function(res) {
          return res.json();
        })
        .then(function(result) {
          var ops = result.map(function(r) {
            return {
              id: r.account_history.operation_id,
              op: JSON.parse(r.operation_history.op),
              result: JSON.parse(r.operation_history.operation_result),
              block_num: r.block_data.block_num,
              block_time: r.block_data.block_time + "Z"
            };
          });
          resolve(ops);
        })
        .catch(function() {
          resolve([]);
        });
    });
  }

  function getAccountHistory(account_id, stop, limit, start) {
    return new Promise(function(resolve, reject) {
      bts.Apis.instance()
        .history_api()
        .exec("get_account_history", [account_id, stop, limit, start])
        .then(function(operations) {
          resolve(operations);
        })
        .catch(reject);
    });
  }

  return {
    getAccountHistory: getAccountHistory,
    getAccountHistoryES: getAccountHistoryES
  };
};
