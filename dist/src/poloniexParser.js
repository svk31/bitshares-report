"use strict";

var fs = require("fs");
var parse = require("csv-parse");
var moment = require("moment");
var inputFile = "tradeHistory.csv";

var header = [
    "Type",
    "Buy Amount",
    "Buy Currency",
    "Sell Amount",
    "Sell Currency",
    "Fee Amount",
    "Fee Currency",
    "Exchange",
    "Trade Group",
    "Comment",
    "Date"
];

var parser = parse({delimiter: ","}, function(err, data) {
    /* Group entries belonging to the same order */
    var previous = {};
    // amount, total, fee quote, base less fee, quote less fee
    var entriesToSum = [5, 6, 9, 10];
    var head = void 0;
    var asObject = data.reduce(function(final, entry, idx) {
        if (entry[0] === "Date") {
            head = entry;
            return final;
        }
        final[idx] = entry;
        return final;
    }, {});
    var originalLength = Object.keys(asObject).length;
    Object.keys(asObject).forEach(function(indice) {
        var current = asObject[indice];
        var timestamp = asObject[indice][0];
        var t0 = moment(timestamp);
        var market = asObject[indice][1];
        var type = asObject[indice][3];
        var price = asObject[indice][4];
        var orderNumber = asObject[indice][8];

        var key = market + type;
        // amount = 5, total = 6
        /*
        * If we're in the same market with the same price, it's the same order,
        * so we group the fills together
        */
        var t1 = !!previous[key] ? moment(previous[key].data[0]) : null;
        if (previous[key] && orderNumber === previous[key].data[8]) {
            entriesToSum.forEach(function(idx) {
                asObject[indice][idx] =
                    parseFloat(asObject[indice][idx]) +
                    parseFloat(previous[key].data[idx]);
            });
            delete asObject[previous[key].idx];
        }

        previous[key] = {data: asObject[indice], idx: indice};
    });

    console.log(
        "Removed",
        originalLength - Object.keys(asObject).length,
        "trade entries by order grouping"
    );
    fs.open("output/poloniexTradeHistory_grouped.csv", "w", function(err, fd) {
        if (err) throw err;
        var contents = "";
        contents += head.join(",") + "\n";
        for (var line in asObject) {
            contents += asObject[line].join(",") + "\n";
        }
        fs.write(fd, contents, function() {
            console.log("\nWrote grouped Poloniex trade history to file!");
        });
    });
});
fs.createReadStream(inputFile).pipe(parser);

/* DepositHistory */
var parser = parse({delimiter: ","}, function(err, data) {
    console.log("Found:", data.length, "deposit entries");

    fs.open("output/poloniexDepositHistory.csv", "w", function(err, fd) {
        if (err) throw err;

        var withdrawOut = [];
        withdrawOut.push(header);
        // 2017-06-09 15:50:43, BTS, 52225.44149000, 93241942662236c7,COMPLETE
        data.forEach(function(d) {
            if (d[2] !== "Amount")
                withdrawOut.push([
                    "Deposit",
                    d[2],
                    d[1],
                    "",
                    "",
                    "",
                    "",
                    "Poloniex",
                    "",
                    d[3],
                    d[0]
                ]);
        });

        var contents = "";
        for (
            var _iterator = withdrawOut,
                _isArray = Array.isArray(_iterator),
                _i = 0,
                _iterator = _isArray ? _iterator : _iterator[Symbol.iterator]();
            ;

        ) {
            var _ref;

            if (_isArray) {
                if (_i >= _iterator.length) break;
                _ref = _iterator[_i++];
            } else {
                _i = _iterator.next();
                if (_i.done) break;
                _ref = _i.value;
            }

            var line = _ref;

            contents += line.join(",") + "\n";
        }
        fs.write(fd, contents, function() {
            console.log("\nWrote Poloniex deposit history to file!");
        });
    });
});
fs.createReadStream("depositHistory.csv").pipe(parser);

/* Withdrawal History */
var parser = parse({delimiter: ","}, function(err, data) {
    console.log("Found:", data.length, "withdrawal entries");

    fs.open("output/poloniexWithdrawHistory.csv", "w", function(err, fd) {
        if (err) throw err;

        var depositOut = [];
        depositOut.push(header);
        // 2017-10-28 11:22:51,SJCX,40047.36979911,17jzQhidKmmLrceAC47QptDjogz3TYBkcr,COMPLETE: e12e30b18fcc6aa8645dcd10dfd827dd90315215a9e8f6c88d7db60fe6c564e8
        data.forEach(function(d) {
            if (d[2] !== "Amount")
                depositOut.push([
                    "Withdrawal",
                    "",
                    "",
                    d[2],
                    d[1],
                    "",
                    "",
                    "Poloniex",
                    "",
                    d[3],
                    d[0]
                ]);
        });

        var contents = "";
        for (
            var _iterator2 = depositOut,
                _isArray2 = Array.isArray(_iterator2),
                _i2 = 0,
                _iterator2 = _isArray2
                    ? _iterator2
                    : _iterator2[Symbol.iterator]();
            ;

        ) {
            var _ref2;

            if (_isArray2) {
                if (_i2 >= _iterator2.length) break;
                _ref2 = _iterator2[_i2++];
            } else {
                _i2 = _iterator2.next();
                if (_i2.done) break;
                _ref2 = _i2.value;
            }

            var line = _ref2;

            contents += line.join(",") + "\n";
        }
        fs.write(fd, contents, function() {
            console.log("\nWrote Poloniex withdrawal history to file!");
        });
    });
});
fs.createReadStream("withdrawalHistory.csv").pipe(parser);
