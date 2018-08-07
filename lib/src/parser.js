const moment = require("moment");
const utils = require("./utils");

let assetMovements = {};
let runningBalance = {};
let movementTypes = {};
let accountBalances = {};
let transfers = {};
let fills = {};

function getFinalBalance(asset) {
  let sum = 0;
  if (!assetMovements[asset]) return 0;
  assetMovements[asset].forEach(movement => {
    sum += movement;
  });
  return sum;
}

function trackMovements(asset, amount, type, timestamp) {
  if (!assetMovements[asset]) assetMovements[asset] = [];
  if (!runningBalance[asset]) runningBalance[asset] = [];

  assetMovements[asset].push(amount);
  runningBalance[asset].push([type, amount, new Date(timestamp)]);

  if (!movementTypes[asset]) movementTypes[asset] = {};
  if (!movementTypes[asset][type])
    movementTypes[asset][type] = { deposit: [], withdrawal: [] };

  movementTypes[asset][type][amount > 0 ? "deposit" : "withdrawal"].push(
    amount
  );
}

function addOutputEntry(
  output,
  type,
  buy,
  sell,
  fee,
  date,
  opType,
  comment,
  tradeGroup
) {
  if (!buy) buy = { amount: "", currency: "" };
  if (!sell) sell = { amount: "", currency: "" };
  if (!fee) fee = { amount: "", currency: "" };

  if (buy.amount) trackMovements(buy.currency, buy.amount, opType, date);
  if (sell.amount) trackMovements(sell.currency, -sell.amount, opType, date);
  if (fee.amount) trackMovements(fee.currency, -fee.amount, opType, date);

  output.push([
    type,
    utils.printAmount(buy),
    buy.currency,
    utils.printAmount(sell),
    sell.currency,
    utils.printAmount(fee),
    fee.currency,
    "BTS-DEX",
    tradeGroup || "",
    comment || "",
    date
  ]);

  return output;
}

function filterEntries(entries, FILTER_TYPE, FILTER_DATE) {
  if (!FILTER_TYPE && !FILTER_DATE) return entries;
  let entriesKeys = Object.keys(entries);
  for (var i = entriesKeys.length - 1; i >= 0; i--) {
    let trx_id = entriesKeys[i];
    let { timestamp, type, data } = entries[trx_id];

    if (!!FILTER_TYPE) {
      if (type !== FILTER_TYPE) {
        delete entries[trx_id];
        continue;
      }
    }

    if (!!FILTER_DATE) {
      if (new Date(timestamp).getTime() < FILTER_DATE) {
        delete entries[trx_id];
        continue;
      }
    }
  }
  console.log(
    `Removed ${entriesKeys.length -
      Object.keys(entries).length} entries by filtering`
  );
  return entries;
}

function groupEntries(entries) {
  let previous_fill = {};
  let recordKeys = Object.keys(entries);
  for (var i = recordKeys.length - 1; i >= 0; i--) {
    let trx_id = recordKeys[i];
    let { timestamp, type, data } = entries[trx_id];

    switch (type) {
      case "fill_order":
        let t1 = moment(timestamp);
        let marketId = data.receives.asset_id + "_" + data.pays.asset_id;
        let previous = previous_fill[marketId];
        let t0 = !!previous ? moment(previous.timestamp) : null;

        if (
          !!previous &&
          t1.isSame(t0, "day") &&
          previous.data.pays.asset_id === data.pays.asset_id &&
          previous.data.receives.asset_id === data.receives.asset_id
        ) {
          data.pays.amount =
            parseInt(data.pays.amount, 10) +
            parseInt(previous.data.pays.amount, 10);
          data.receives.amount =
            parseInt(data.receives.amount, 10) +
            parseInt(previous.data.receives.amount, 10);
          data.fee.amount =
            parseInt(data.fee.amount, 10) +
            parseInt(previous.data.fee.amount, 10);
          entries[trx_id].data = data;
          delete entries[previous.trx_id];
        }
        previous_fill[marketId] = { data, timestamp, trx_id };
        break;

      default:
        break;
    }
  }
  console.log(
    `Removed ${recordKeys.length -
      Object.keys(entries).length} fill_order entries by grouping`
  );
  return entries;
}

function parseData(recordData, accountId, accountName) {
  let out = [];
  out.push([
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
  ]);

  let typeCounts = {};

  function incrementType(type) {
    if (!typeCounts[type]) typeCounts[type] = 0;
    typeCounts[type]++;
  }

  for (let trx_id of Object.keys(recordData)) {
    const { timestamp, type, data } = recordData[trx_id];

    let fee = null;

    switch (type) {
      case "vesting_balance_withdraw":
        let vestingFunds = utils.parseCurrency(data.amount);
        fee = utils.parseCurrency(data.fee);

        out = addOutputEntry(
          out,
          data.owner === "1.2.30665" && vestingFunds.amount > 10000
            ? "Income"
            : "Deposit",
          vestingFunds,
          null,
          fee, // dev.bitsharesblocks
          timestamp,
          type,
          `${accountName} : Vesting balance withdraw`
        );
        incrementType(type);
        break;

      case "balance_claim":
        let balanceClaimFunds = utils.parseCurrency(data.total_claimed);

        out = addOutputEntry(
          out,
          "Deposit",
          balanceClaimFunds,
          null,
          null,
          timestamp,
          type,
          `${accountName} : Balance claim`
        );

        incrementType(type);
        break;

      case "transfer":
        let funds = utils.parseCurrency(data.amount);
        fee = utils.parseCurrency(data.fee);
        if (data.to == accountId) {
          // Funds coming in to the account
          out = addOutputEntry(
            out,
            data.to === "1.2.391938" && data.from === "1.2.381086"
              ? "Income"
              : "Deposit",
            funds,
            null,
            null, // pay.svk and bitshares-ui
            timestamp,
            type,
            `${accountName} : From ${data.from}`
          );
        } else {
          out = addOutputEntry(
            out,
            "Withdrawal",
            null,
            funds,
            fee,
            timestamp,
            type,
            `${accountName}: To ${data.to}`
          );
        }
        incrementType(type);
        break;

      case "fill_order":
        let soldFunds = utils.parseCurrency(data.pays);
        let boughtFunds = utils.parseCurrency(data.receives);
        fee = utils.parseCurrency(data.fee);
        if (fee.currency !== "BTS") {
          if (boughtFunds.currency === fee.currency) {
            boughtFunds.amount -= fee.amount;
            fee.amount = 0;
          } else if (soldFunds.currency === fee.currency) {
            soldFunds.amount -= fee.amount;
            fee.amount = 0;
          }
        }

        out = addOutputEntry(
          out,
          "Trade",
          boughtFunds,
          soldFunds,
          fee,
          timestamp,
          type
        );

        incrementType(type);
        break;

      case "asset_issue": {
        let issuedFunds = utils.parseCurrency(data.asset_to_issue);
        fee = data.issuer === accountId ? utils.parseCurrency(data.fee) : null;
        if (data.issue_to_account === accountId) {
          out = addOutputEntry(
            out,
            "Deposit",
            issuedFunds,
            null,
            fee,
            timestamp,
            type,
            `${accountName} : Issued to account`
          );
        }
        incrementType(type);
        break;
      }

      case "account_update":
      case "proposal_create":
      case "proposal_update":
      case "account_whitelist":
      case "worker_create":
      case "limit_order_create":
      case "limit_order_cancel":
      case "call_order_update":
        fee = utils.parseCurrency(data.fee);
        if (fee.amount > 0) {
          out = addOutputEntry(
            out,
            "Withdrawal",
            null,
            fee,
            null,
            timestamp,
            type,
            `${type} fee`
          );
          incrementType(type);
        }
        break;

      case "account_create":
        if (data.registrar === accountId) {
          fee = utils.parseCurrency(data.fee);
          out = addOutputEntry(
            out,
            "Withdrawal",
            null,
            fee,
            null,
            timestamp,
            type,
            `${type} fee`
          );
          incrementType(type);
        }
        break;

      case "asset_fund_fee_pool": {
        fee = utils.parseCurrency(data.fee);
        let fundFunds = utils.parseCurrency({
          amount: data.amount,
          asset_id: "1.3.0"
        });

        out = addOutputEntry(
          out,
          "Withdrawal",
          null,
          fundFunds,
          fee,
          timestamp,
          type,
          `${type}`
        );

        incrementType(type);
        break;
      }

      default: {
        console.log("Unhandled type:", type, data);
      }
    }
  }
  return out;
}

module.exports = {
  parseData,
  filterEntries,
  groupEntries
};
