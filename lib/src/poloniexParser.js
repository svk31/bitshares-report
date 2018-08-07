var fs = require("fs");
var parse = require("csv-parse");
var moment = require("moment");
var inputFile = "tradeHistory.csv";

let header = [
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

var parser = parse({ delimiter: "," }, function(err, data) {
  /* Group entries belonging to the same order */
  let previous = {};
  // amount, total, fee quote, base less fee, quote less fee
  let entriesToSum = [5, 6, 9, 10];
  let head;
  let asObject = data.reduce((final, entry, idx) => {
    if (entry[0] === "Date") {
      head = entry;
      return final;
    }
    final[idx] = entry;
    return final;
  }, {});
  const originalLength = Object.keys(asObject).length;
  Object.keys(asObject).forEach(indice => {
    let current = asObject[indice];
    let timestamp = asObject[indice][0];
    let t0 = moment(timestamp);
    let market = asObject[indice][1];
    let type = asObject[indice][3];
    let price = asObject[indice][4];
    let orderNumber = asObject[indice][8];

    let key = market + type;
    // amount = 5, total = 6
    /*
        * If we're in the same market with the same price, it's the same order,
        * so we group the fills together
        */
    let t1 = !!previous[key] ? moment(previous[key].data[0]) : null;
    if (previous[key] && orderNumber === previous[key].data[8]) {
      entriesToSum.forEach(function(idx) {
        asObject[indice][idx] =
          parseFloat(asObject[indice][idx]) +
          parseFloat(previous[key].data[idx]);
      });
      delete asObject[previous[key].idx];
    }

    previous[key] = { data: asObject[indice], idx: indice };
  });

  console.log(
    "Removed",
    originalLength - Object.keys(asObject).length,
    "trade entries by order grouping"
  );
  fs.open(`output/poloniexTradeHistory_grouped.csv`, "w", (err, fd) => {
    if (err) throw err;
    let contents = "";
    contents += head.join(",") + "\n";
    for (let line in asObject) {
      contents += asObject[line].join(",") + "\n";
    }
    fs.write(fd, contents, () => {
      console.log(`\nWrote grouped Poloniex trade history to file!`);
    });
  });
});
fs.createReadStream(inputFile).pipe(parser);

/* DepositHistory */
var parser = parse({ delimiter: "," }, function(err, data) {
  console.log("Found:", data.length, "deposit entries");

  fs.open(`output/poloniexDepositHistory.csv`, "w", (err, fd) => {
    if (err) throw err;

    let withdrawOut = [];
    withdrawOut.push(header);
    // 2017-06-09 15:50:43, BTS, 52225.44149000, 93241942662236c7,COMPLETE
    data.forEach(d => {
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

    let contents = "";
    for (let line of withdrawOut) {
      contents += line.join(",") + "\n";
    }
    fs.write(fd, contents, () => {
      console.log(`\nWrote Poloniex deposit history to file!`);
    });
  });
});
fs.createReadStream("depositHistory.csv").pipe(parser);

/* Withdrawal History */
var parser = parse({ delimiter: "," }, function(err, data) {
  console.log("Found:", data.length, "withdrawal entries");

  fs.open(`output/poloniexWithdrawHistory.csv`, "w", (err, fd) => {
    if (err) throw err;

    let depositOut = [];
    depositOut.push(header);
    // 2017-10-28 11:22:51,SJCX,40047.36979911,17jzQhidKmmLrceAC47QptDjogz3TYBkcr,COMPLETE: e12e30b18fcc6aa8645dcd10dfd827dd90315215a9e8f6c88d7db60fe6c564e8
    data.forEach(d => {
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

    let contents = "";
    for (let line of depositOut) {
      contents += line.join(",") + "\n";
    }
    fs.write(fd, contents, () => {
      console.log(`\nWrote Poloniex withdrawal history to file!`);
    });
  });
});
fs.createReadStream("withdrawalHistory.csv").pipe(parser);
