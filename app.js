const api = require("./api");
const operations = require("bitsharesjs").ChainTypes.operations;
const ops = Object.keys(operations);
const fs = require('fs');
const moment = require("moment");
const utils = require("./utils");

if (process.argv.length < 3) {
    const path = require('path');
    let fileName = path.basename(__filename);
    console.log(`Usage: node ${fileName} userName`);
    process.exit();
}

const user = process.argv[2];
const CHECK = process.argv[3] === "true";
const NO_GROUPING = process.argv[4] === "true";
const FILTER_TYPE = process.argv[5];

const FILTER_DATE = null; // new Date("2018-05-23").getTime();

let assetMovements = {};
let transfers = {};
let fills = {};
let runningBalance = {};
let accountBalances = {};
let movementTypes = {};

function trackMovements(asset, amount, type, timestamp) {
    if (!assetMovements[asset]) assetMovements[asset] = [];
    if (!runningBalance[asset]) runningBalance[asset] = [];

    assetMovements[asset].push(amount);
    runningBalance[asset].push([type, amount, new Date(timestamp)]);

    if (!movementTypes[asset]) movementTypes[asset] = {};
    if (!movementTypes[asset][type]) movementTypes[asset][type] = {deposit: [], withdrawal: []};

    movementTypes[asset][type][amount > 0 ? "deposit" : "withdrawal"].push(amount);
}

function getFinalBalance(asset) {
    let sum = 0;
    if (!assetMovements[asset]) return 0;
    assetMovements[asset].forEach(movement => {
        sum += movement;
    });
    return sum;
}

function filterEntries(entries) {
    if (!FILTER_TYPE && !FILTER_DATE) return entries;
    let entriesKeys = Object.keys(entries);
    for (var i = entriesKeys.length - 1; i >= 0; i--) {
        let trx_id = entriesKeys[i];
        let {
            timestamp,
            type,
            data
        } = entries[trx_id];

        if (!!FILTER_TYPE) {
            if (type !== FILTER_TYPE) {
                delete entries[trx_id];
                continue;
            }
        }

        if(!!FILTER_DATE) {
            if (new Date(timestamp).getTime() < FILTER_DATE) {
                delete entries[trx_id];
                continue;
            }
        }
    }
    console.log(`Removed ${entriesKeys.length - Object.keys(entries).length} entries by filtering`);
    return entries;
}

function groupEntries(entries) {
    let previous_fill = {};
    let recordKeys = Object.keys(entries);
    for (var i = recordKeys.length - 1; i >= 0; i--) {
        let trx_id = recordKeys[i];
        let {
            timestamp,
            type,
            data
        } = entries[trx_id];

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
                data.pays.amount = parseInt(data.pays.amount, 10) + parseInt(previous.data.pays.amount, 10);
                data.receives.amount = parseInt(data.receives.amount, 10) + parseInt(previous.data.receives.amount, 10);
                data.fee.amount = parseInt(data.fee.amount, 10) + parseInt(previous.data.fee.amount, 10);
                entries[trx_id].data = data;
                delete entries[previous.trx_id];
            }
            previous_fill[marketId] = {data, timestamp, trx_id};
            break;

            default:
            break;
        }
    }
    console.log(`Removed ${recordKeys.length - Object.keys(entries).length} fill_order entries by grouping`);
    return entries;
}

function addOutputEntry(output, type, buy, sell, fee, date, opType, comment, tradeGroup) {
    if (!buy) buy = {amount: "", currency: ""};
    if (!sell) sell = {amount: "", currency: ""};
    if (!fee) fee = {amount: "", currency: ""};

    if (buy.amount) trackMovements(buy.currency, buy.amount, opType, date);
    if (sell.amount) trackMovements(sell.currency, -sell.amount, opType, date);
    if (fee.amount) trackMovements(fee.currency, -fee.amount, opType, date);

    output.push([
        type, utils.printAmount(buy), buy.currency, utils.printAmount(sell),
        sell.currency, utils.printAmount(fee), fee.currency, "BTS-DEX",
        tradeGroup || "", comment || "", date
    ]);

    return output;
}

function doReport(recordData, accountId) {
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
        "Date",
    ]);

    recordData = filterEntries(recordData);
    /* Group fill_orders for the same market that are within one hour of each other */
    if (!NO_GROUPING) recordData = groupEntries(recordData);

    let typeCounts = {};

    function incrementType(type) {
        if (!typeCounts[type]) typeCounts[type] = 0;
        typeCounts[type]++;
    }

    for (let trx_id of Object.keys(recordData)) {
        const {
            timestamp,
            type,
            data
        } = recordData[trx_id];

        let fee = null;

        switch (type) {

            case "vesting_balance_withdraw":
                let vestingFunds = utils.parseCurrency(data.amount);
                fee = utils.parseCurrency(data.fee);

                out = addOutputEntry(
                    out, data.owner === "1.2.30665" && vestingFunds.amount > 10000 ? "Income" : "Deposit", vestingFunds, null, fee, // dev.bitsharesblocks
                    timestamp, type, `${user} : Vesting balance withdraw`
                );
                incrementType(type)
                break;

            case "balance_claim":
                let balanceClaimFunds = utils.parseCurrency(data.total_claimed);

                out = addOutputEntry(
                    out, "Deposit", balanceClaimFunds, null, null,
                    timestamp, type, `${user} : Balance claim`
                );

                incrementType(type)
                break;


            case "transfer":
                let funds = utils.parseCurrency(data.amount);
                fee = utils.parseCurrency(data.fee);
                if (data.to == accountId) {
                    // Funds coming in to the account
                    out = addOutputEntry(
                        out, data.to === "1.2.391938" && data.from === "1.2.381086" ? "Income" : "Deposit", funds, null, null, // pay.svk and bitshares-ui
                        timestamp, type, `${user} : From ${data.from}`
                    );
                } else {
                    out = addOutputEntry(
                        out, "Withdrawal", null, funds, fee,
                        timestamp, type, `${user}: To ${data.to}`
                    );
                }
                incrementType(type);
                break;

            case 'fill_order':
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
                    out, "Trade", boughtFunds, soldFunds, fee,
                    timestamp, type
                );

                incrementType(type);
                break;

            case "asset_issue": {
                let issuedFunds = utils.parseCurrency(data.asset_to_issue);
                fee = data.issuer === accountId ? utils.parseCurrency(data.fee) : null;
                if (data.issue_to_account === accountId) {
                    out = addOutputEntry(
                        out, "Deposit", issuedFunds, null, fee,
                        timestamp, type, `${user} : Issued to account`
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
                        out, "Withdrawal", null, fee, null,
                        timestamp, type, `${type} fee`
                    );
                    incrementType(type);
                }
                break;

            case "account_create":
                if (data.registrar === accountId) {
                    fee = utils.parseCurrency(data.fee);
                    out = addOutputEntry(
                        out, "Withdrawal", null, fee, null,
                        timestamp, type, `${type} fee`
                    );
                    incrementType(type);
                }
                break;

            case "asset_fund_fee_pool": {
                fee = utils.parseCurrency(data.fee);
                let fundFunds = utils.parseCurrency({amount: data.amount, asset_id: "1.3.0"});

                out = addOutputEntry(
                    out, "Withdrawal", null, fundFunds, fee,
                    timestamp, type, `${type}`
                );

                incrementType(type);
                break;
            }

            default: {
                console.log("Unhandled type:", type, data);
            }
        }
    }

    /* Some checking code here */
    let assetsToCheck = ["BTS", "BTC"];
    console.log("");
    let assets = Object.keys(assetMovements).sort();
    assets.forEach(asset => {
        let bal = getFinalBalance(asset);
        let assetName = asset;
        while (assetName.length < 16) {
            assetName += " ";
        }
        console.log(`${assetName} | Actual balance: ${(accountBalances[asset].amount).toFixed(6)} | Calculated balance: ${bal.toFixed(6)} | delta: ${(accountBalances[asset].amount - bal).toFixed(5)}`);
    });
    if (CHECK) {
        Object.keys(runningBalance).forEach(asset => {
            if (!runningBalance[asset][0]) return;
            runningBalance[asset].sort((a, b) => a[2].getTime() - b[2].getTime());
            runningBalance[asset][0].push(runningBalance[asset][0][1]);

            for (var i = 1; i < runningBalance[asset].length; i++) {
                runningBalance[asset][i].push(runningBalance[asset][i][1] + runningBalance[asset][i-1][3]);
            }
        })

        console.log("");
        assetsToCheck.forEach(assetToCheck => {
            console.log(`**** Asset movement by type for ${assetToCheck}: ****\n`)
            getFinalBalance(assetToCheck);
            function getTotal(array) {
                let sum = 0;
                array.forEach(i => {
                    sum += i;
                })
                return sum;
            }

            if (movementTypes[assetToCheck]) {
                Object.keys(movementTypes[assetToCheck]).forEach(type => {
                    let deposit = getTotal(movementTypes[assetToCheck][type].deposit);
                    if (deposit > 0) console.log(type, "in :", deposit);
                    let out = getTotal(movementTypes[assetToCheck][type].withdrawal);
                    if (out < 0) console.log(type, "out:", out);
                    if (out < 0 && deposit > 0) console.log(type, "net: ", (deposit + out), "\n");
                    else console.log("");
                })
            }
        })
        console.log("\nTransaction type counts:\n", typeCounts);
    }

    // console.log("Fills", fills["STEEM"]);
    // Output the CSV
    if (CHECK) {
        assetsToCheck.forEach(assetToCheck => {
            fs.open(`output/${user}-${assetToCheck}-running-balances.csv`, 'w', (err, fd) => {
                if (err) throw err;
                let contents = '';
                for (let line of runningBalance[assetToCheck]) {
                    contents += line.join(',') + "\n";
                }
                fs.write(fd, contents, () => {
                    console.log(`\nWrote running balance for ${assetToCheck} to file!`);
                });
            });
        })
    }

    fs.open(`output/${user}-bts-transactions.csv`, 'w', (err, fd) => {
        if (err) throw err;
        let contents = '';
        for (let line of out) {
            contents += line.join(',') + "\n";
        }
        fs.write(fd, contents, () => {
            console.log('Done writing report!');
            console.log("\n*******\nIf you're missing transactions, make sure the node you're connected to \nhas max-ops-per-account set to a high number (such as 100000)\n*******")
        });
    });
}

const opHistoryObject = "1.11.";

async function doWork() {
    let pageSize = 50;
    let finalOp = 0;
    let minSeen;

    let recordData = {};
    let connect = await api.connect();
    console.log("\n____ " + user + " ____\n");
    console.log("Connected to network:", connect[0].network_name);
    const {accountId, balances, assets} = await api.getUser(user);
    console.log(user, "accountId", accountId);

    let start = opHistoryObject + "0";
    let stop = opHistoryObject + "0";

    console.time("**** Done fetching data, time taken: ");
    console.log(`**** FETCHING DATA FOR ${user}, THIS MAY TAKE SEVERAL MINUTES.... ****`)

    while (true) {
        // console.log(`Fetching from index ${start}...`);
        let result = await api.getBatch(accountId, stop, pageSize, start);
        if (!result.length || result[result.length-1].id === minSeen) {
            console.timeEnd("**** Done fetching data, time taken: ");
            break;
        }
        minSeen = result[result.length-1].id;

        /* Before parsing results we need to know the block times */
        await api.resolveBlockTimes(result);

        /* Before parsing results we need to know the asset info (precision) */
        await api.resolveAssets(null, assets);
        await api.resolveAssets(result);

        /* Now that we have all assets, parse the balances properly */
        balances.forEach(b => {
            let amount = utils.parseCurrency({amount: b.balance, asset_id: b.asset_type});
            accountBalances[amount.currency] = amount;
        })

        result.map(function(record) {
            const trx_id = record.id;
            let timestamp = api.getBlock(record.block_num);
            const type = ops[record.op[0]];
            const data = record.op[1];

            switch (type) {
                default:
                recordData[trx_id] = {
                    timestamp,
                    type,
                    data
                };
            }
        });

        start = opHistoryObject + (utils.getIndex(minSeen) - 1);
    }

    doReport(recordData, accountId);
    api.disconnect();
}
doWork();
