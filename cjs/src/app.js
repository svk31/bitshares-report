"use strict";

var doWork = (function() {
  var _ref = _asyncToGenerator(
    /*#__PURE__*/ regeneratorRuntime.mark(function _callee() {
      var pageSize,
        finalOp,
        minSeen,
        recordData,
        connect,
        _ref2,
        accountId,
        balances,
        assets,
        start,
        stop,
        result,
        parsedDataString;

      return regeneratorRuntime.wrap(
        function _callee$(_context) {
          while (1) {
            switch ((_context.prev = _context.next)) {
              case 0:
                pageSize = config.useES ? 150 : 50;
                finalOp = 0;
                minSeen = void 0;
                recordData = {};
                _context.next = 6;
                return api.connect();

              case 6:
                connect = _context.sent;

                console.log("\n____ " + user + " ____\n");
                console.log("Connected to network:", connect[0].network_name);
                if (config.useES)
                  console.log(
                    "Using Elastic Search for account history:",
                    config.esNode,
                    "\n"
                  );
                _context.next = 12;
                return api.getUser(user);

              case 12:
                _ref2 = _context.sent;
                accountId = _ref2.accountId;
                balances = _ref2.balances;
                assets = _ref2.assets;

                console.log(user, "accountId", accountId);

                start = opHistoryObject + "0";

                if (config.useES) start = 0;
                stop = opHistoryObject + "0";

                console.time("**** Done fetching data, time taken: ");
                console.log(
                  "**** FETCHING DATA FOR " +
                    user +
                    ", THIS MAY TAKE SEVERAL MINUTES.... ****"
                );

              case 22:
                if (!true) {
                  _context.next = 47;
                  break;
                }

                if (!config.useES) {
                  _context.next = 29;
                  break;
                }

                _context.next = 26;
                return accountHistoryApi.getAccountHistoryES(
                  accountId,
                  pageSize,
                  start,
                  config.esNode
                );

              case 26:
                _context.t0 = _context.sent;
                _context.next = 32;
                break;

              case 29:
                _context.next = 31;
                return accountHistoryApi.getAccountHistory(
                  accountId,
                  stop,
                  pageSize,
                  start
                );

              case 31:
                _context.t0 = _context.sent;

              case 32:
                result = _context.t0;

                if (
                  !(!result.length || result[result.length - 1].id === minSeen)
                ) {
                  _context.next = 36;
                  break;
                }

                console.timeEnd("**** Done fetching data, time taken: ");
                return _context.abrupt("break", 47);

              case 36:
                minSeen = result[result.length - 1].id;
                /* Before parsing results we need to know the block times */
                _context.next = 39;
                return api.resolveBlockTimes(result);

              case 39:
                _context.next = 41;
                return api.resolveAssets(null, assets);

              case 41:
                _context.next = 43;
                return api.resolveAssets(result);

              case 43:
                /* Now that we have all assets, parse the balances properly */
                // balances.forEach(b => {
                //     let amount = utils.parseCurrency({amount: b.balance, asset_id: b.asset_type});
                //     accountBalances[amount.currency] = amount;
                // })

                result.map(function(record) {
                  var trx_id = record.id;
                  var timestamp = api.getBlock(record.block_num);
                  var type = ops[record.op[0]];
                  var data = record.op[1];

                  switch (type) {
                    default:
                      recordData[trx_id] = {
                        timestamp: timestamp,
                        type: type,
                        data: data
                      };
                  }
                });

                if (config.useES) start += result.length;
                else start = opHistoryObject + (utils.getIndex(minSeen) - 1);
                _context.next = 22;
                break;

              case 47:
                recordData = filterEntries(
                  recordData,
                  FILTER_TYPE,
                  FILTER_DATE
                );
                /* Group fill_orders for the same market that are within one hour of each other */
                if (!NO_GROUPING) recordData = groupEntries(recordData);

                parsedDataString = parseData(recordData, accountId, user);

                /* Some checking code here */
                // let assetsToCheck = ["BTS", "BTC"];
                // console.log("");
                // let assets = Object.keys(assetMovements).sort();
                // assets.forEach(asset => {
                //     let bal = getFinalBalance(asset);
                //     let assetName = asset;
                //     while (assetName.length < 16) {
                //         assetName += " ";
                //     }
                //     console.log(`${assetName} | Actual balance: ${(accountBalances[asset].amount).toFixed(6)} | Calculated balance: ${bal.toFixed(6)} | delta: ${(accountBalances[asset].amount - bal).toFixed(5)}`);
                // });

                if (CHECK) {
                  Object.keys(runningBalance).forEach(function(asset) {
                    if (!runningBalance[asset][0]) return;
                    runningBalance[asset].sort(function(a, b) {
                      return a[2].getTime() - b[2].getTime();
                    });
                    runningBalance[asset][0].push(runningBalance[asset][0][1]);

                    for (var i = 1; i < runningBalance[asset].length; i++) {
                      runningBalance[asset][i].push(
                        runningBalance[asset][i][1] +
                          runningBalance[asset][i - 1][3]
                      );
                    }
                  });

                  console.log("");
                  assetsToCheck.forEach(function(assetToCheck) {
                    console.log(
                      "**** Asset movement by type for " +
                        assetToCheck +
                        ": ****\n"
                    );
                    getFinalBalance(assetToCheck);
                    function getTotal(array) {
                      var sum = 0;
                      array.forEach(function(i) {
                        sum += i;
                      });
                      return sum;
                    }

                    if (movementTypes[assetToCheck]) {
                      Object.keys(movementTypes[assetToCheck]).forEach(function(
                        type
                      ) {
                        var deposit = getTotal(
                          movementTypes[assetToCheck][type].deposit
                        );
                        if (deposit > 0) console.log(type, "in :", deposit);
                        var out = getTotal(
                          movementTypes[assetToCheck][type].withdrawal
                        );
                        if (out < 0) console.log(type, "out:", out);
                        if (out < 0 && deposit > 0)
                          console.log(type, "net: ", deposit + out, "\n");
                        else console.log("");
                      });
                    }
                  });
                  console.log("\nTransaction type counts:\n", typeCounts);
                }

                // console.log("Fills", fills["STEEM"]);
                // Output the CSV
                if (CHECK) {
                  assetsToCheck.forEach(function(assetToCheck) {
                    fs.open(
                      "output/" +
                        user +
                        "-" +
                        assetToCheck +
                        "-running-balances.csv",
                      "w",
                      function(err, fd) {
                        if (err) throw err;
                        var contents = "";
                        for (
                          var _iterator = runningBalance[assetToCheck],
                            _isArray = Array.isArray(_iterator),
                            _i = 0,
                            _iterator = _isArray
                              ? _iterator
                              : _iterator[Symbol.iterator]();
                          ;

                        ) {
                          var _ref3;

                          if (_isArray) {
                            if (_i >= _iterator.length) break;
                            _ref3 = _iterator[_i++];
                          } else {
                            _i = _iterator.next();
                            if (_i.done) break;
                            _ref3 = _i.value;
                          }

                          var line = _ref3;

                          contents += line.join(",") + "\n";
                        }
                        fs.write(fd, contents, function() {
                          console.log(
                            "\nWrote running balance for " +
                              assetToCheck +
                              " to file!"
                          );
                        });
                      }
                    );
                  });
                }

                fs.open(
                  "output/" + user + "-bts-transactions.csv",
                  "w",
                  function(err, fd) {
                    if (err) throw err;
                    var contents = "";
                    for (
                      var _iterator2 = parsedDataString,
                        _isArray2 = Array.isArray(_iterator2),
                        _i2 = 0,
                        _iterator2 = _isArray2
                          ? _iterator2
                          : _iterator2[Symbol.iterator]();
                      ;

                    ) {
                      var _ref4;

                      if (_isArray2) {
                        if (_i2 >= _iterator2.length) break;
                        _ref4 = _iterator2[_i2++];
                      } else {
                        _i2 = _iterator2.next();
                        if (_i2.done) break;
                        _ref4 = _i2.value;
                      }

                      var line = _ref4;

                      contents += line.join(",") + "\n";
                    }
                    fs.write(fd, contents, function() {
                      console.log("Done writing report!");
                      console.log(
                        "\n*******\nIf you're missing transactions, make sure the node you're connected to \nhas max-ops-per-account set to a high number (such as 100000)\n*******"
                      );
                    });
                  }
                );
                api.disconnect();

              case 54:
              case "end":
                return _context.stop();
            }
          }
        },
        _callee,
        this
      );
    })
  );

  return function doWork() {
    return _ref.apply(this, arguments);
  };
})();

function _asyncToGenerator(fn) {
  return function() {
    var gen = fn.apply(this, arguments);
    return new Promise(function(resolve, reject) {
      function step(key, arg) {
        try {
          var info = gen[key](arg);
          var value = info.value;
        } catch (error) {
          reject(error);
          return;
        }
        if (info.done) {
          resolve(value);
        } else {
          return Promise.resolve(value).then(
            function(value) {
              step("next", value);
            },
            function(err) {
              step("throw", err);
            }
          );
        }
      }
      return step("next");
    });
  };
}

var api = require("./api/nodeApi");
var accountHistoryApi = require("./api/getAccountHistory")(false);
var operations = require("bitsharesjs").ChainTypes.operations;
var ops = Object.keys(operations);
var fs = require("fs");
var utils = require("./utils");
var config = require("./config");

var _require = require("./parser"),
  filterEntries = _require.filterEntries,
  groupEntries = _require.groupEntries,
  parseData = _require.parseData;

if (process.argv.length < 3) {
  var path = require("path");
  var fileName = path.basename(__filename);
  console.log("Usage: node " + fileName + " userName");
  process.exit();
}

var user = process.argv[2];
var CHECK = process.argv[3] === "true";
var NO_GROUPING = process.argv[4] === "true";
var FILTER_TYPE = process.argv[5];

var FILTER_DATE = null; // new Date("2018-05-23").getTime();

var opHistoryObject = "1.11.";

doWork();
