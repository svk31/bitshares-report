const bts = require('bitsharesjs-ws');
const operations = require("bitsharesjs").ChainTypes.operations;
const ops = Object.keys(operations);
const fs = require('fs');
const moment = require("moment");

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

// const FILTER_DATE = new Date("2018-05-23").getTime();

/* Maintain a map of block numbers to block timestamp */
let blockData = require("./blockData.json");
let assetData = require("./assetData.json");

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

function precisionToRatio(p) {
    if (typeof p !== "number") throw new Error("Input must be a number");
    return Math.pow(10, p);
}

function connectToChain() {
    // let node = "wss://eu.nodes.bitshares.ws";
    let node = "ws://127.0.0.1:8090";
    return new Promise((resolve) => {
        bts.Apis.instance(node, true).init_promise.then(resolve).catch((err => {
            console.error("Error connection to node:", err);
        }));
    });
}

function disconnectFromChain() {
    bts.Apis.instance().close();
}

function getUser(name) {
    return new Promise((resolve, reject) => {
        bts.Apis.instance().db_api().exec("get_full_accounts", [[name], false])
        .then((result) => {
            let [account] = result;
            if (!account[1].balances) account[1].balances = [];
            if (!account[1].call_orders) account[1].call_orders = [];
            let assets = account[1].balances.map(b => {
                return b.asset_type;
            });

            account[1].call_orders.forEach(c => {
                let balanceIndex = account[1].balances.findIndex(b => {
                    return b.asset_type === c.call_price.base.asset_id;
                });
                if(balanceIndex !== -1) {
                    let newBalance = parseInt(account[1].balances[balanceIndex].balance, 10) +
                    parseInt(c.collateral, 10);
                    account[1].balances[balanceIndex].balance = newBalance;

                } else {
                    assets.push(c.call_price.base.asset_id);
                    account[1].balances.push({
                        balance: c.collateral,
                        asset_type: c.call_price.base.asset_id
                    })
                }
            });

            resolve({accountId: account[1].account.id, assets, balances: account[1].balances});

        }).catch(reject);
    });
}

function getBlockTime(block) {
    return new Promise((resolve, reject) => {
        if (blockData[block]) return resolve(blockData[block]);

        bts.Apis.instance().db_api().exec("get_block", [block])
        .then((result) => {
            blockData[block] = new Date(result.timestamp + "Z");
            resolve(blockData[block]);
        }).catch(reject);
    });
}

function resolveBlockTimes(operations) {
    return new Promise((resolve, reject) => {
        let promises = operations.map(op => {
            return getBlockTime(op.block_num);
        });
        Promise.all(promises).then(() => {
            fs.writeFile("./blockData.json", JSON.stringify(blockData), "utf8", function(err) {
                if (err) reject();
                resolve();
            });
        }).catch(reject);
    });
}

function getAssetData(asset) {
    return new Promise((resolve, reject) => {
        if (assetData[asset]) return resolve(assetData[asset]);

        bts.Apis.instance().db_api().exec("get_objects", [[asset]])
        .then((result) => {
            let [a] = result;
            assetData[asset] = {name: a.symbol.replace(/OPEN\.|BRIDGE\.|RUDEX\.|GDEX\.|BLOCK\./, ""), precision: a.precision, precisionRatio: precisionToRatio(a.precision)};
            resolve(assetData[asset]);
        }).catch(reject);
    });
}

function resolveAssets(operations, list) {
    return new Promise((resolve, reject) => {
        let promises = [];
        let assets = {};
        if (operations) {
            operations.forEach(record => {
                const type = ops[record.op[0]];
                switch (type) {
                    case "transfer": {
                        // console.log("transfer record.op:", record.op);
                        assets[record.op[1].amount.asset_id] = true;
                        assets[record.op[1].fee.asset_id] = true;
                        break;
                    }
                    case "fill_order": {
                        assets[record.op[1].pays.asset_id] = true;
                        assets[record.op[1].receives.asset_id] = true;
                        assets[record.op[1].fee.asset_id] = true;
                        break;
                    }
                    case "asset_issue": {
                        assets[record.op[1].asset_to_issue.asset_id] = true;
                        assets[record.op[1].fee.asset_id] = true;
                        break;
                    }
                    default: {
                        break;
                    }
                }
            });
        }

        if (list) {
            list.forEach(entry => {
                assets[entry] = true;
            })
        }


        Object.keys(assets).forEach(asset_id => {
            if (!assetData[asset_id] && !!asset_id) {
                promises.push(getAssetData(asset_id));
            }
        })
        Promise.all(promises).then(() => {
            fs.writeFile("./assetData.json", JSON.stringify(assetData), "utf8", function(err) {
                if (err) reject();
                resolve();
            });
        }).catch(reject);
    });
}

function getBatch(account_id, stop, limit, start) {
    return new Promise((resolve, reject) => {
        bts.Apis.instance()
        .history_api()
        .exec("get_account_history", [
            account_id,
            stop,
            limit,
            start
        ])
        .then(operations => {
            resolve(operations);
        }).catch(reject);
    });
}

function parseCurrency(amount) {
    let asset = assetData[amount.asset_id];
    let fullAmount = amount.amount / asset.precisionRatio;
    return {
        amount: fullAmount,
        currency: asset.name,
        asset_id: amount.asset_id
    };
}

function printAmount(amount) {
    if (!amount.amount || !amount.currency) return "";
    let asset = assetData[amount.asset_id];

    return (amount.amount).toFixed(asset.precision);
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
        type, printAmount(buy), buy.currency, printAmount(sell),
        sell.currency, printAmount(fee), fee.currency, "BTS-DEX",
        tradeGroup || "", comment || "", date
    ]);

    return output;
}

function getIndex(str) {
    let pieces = str.split(".");
    return parseInt(pieces[2], 10);
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
                let vestingFunds = parseCurrency(data.amount);
                fee = parseCurrency(data.fee);

                out = addOutputEntry(
                    out, data.owner === "1.2.30665" && vestingFunds.amount > 10000 ? "Income" : "Deposit", vestingFunds, null, fee, // dev.bitsharesblocks
                    timestamp, type, `${user} : Vesting balance withdraw`
                );
                incrementType(type)
                break;

            case "balance_claim":
                let balanceClaimFunds = parseCurrency(data.total_claimed);

                out = addOutputEntry(
                    out, "Deposit", balanceClaimFunds, null, null,
                    timestamp, type, `${user} : Balance claim`
                );

                incrementType(type)
                break;


            case "transfer":
                let funds = parseCurrency(data.amount);
                fee = parseCurrency(data.fee);
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
                let soldFunds = parseCurrency(data.pays);
                let boughtFunds = parseCurrency(data.receives);
                fee = parseCurrency(data.fee);
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
                let issuedFunds = parseCurrency(data.asset_to_issue);
                fee = data.issuer === accountId ? parseCurrency(data.fee) : null;
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
                fee = parseCurrency(data.fee);
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
                    fee = parseCurrency(data.fee);
                    out = addOutputEntry(
                        out, "Withdrawal", null, fee, null,
                        timestamp, type, `${type} fee`
                    );
                    incrementType(type);
                }
                break;

            case "asset_fund_fee_pool": {
                fee = parseCurrency(data.fee);
                let fundFunds = parseCurrency({amount: data.amount, asset_id: "1.3.0"});

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
    let connect = await connectToChain();
    console.log("\n____ " + user + " ____\n");
    console.log("Connected to network:", connect[0].network_name);
    const {accountId, balances, assets} = await getUser(user);
    console.log(user, "accountId", accountId);

    let start = opHistoryObject + "0";
    let stop = opHistoryObject + "0";

    console.time("**** Done fetching data, time taken: ");
    console.log(`**** FETCHING DATA FOR ${user}, THIS MAY TAKE SEVERAL MINUTES.... ****`)

    while (true) {
        // console.log(`Fetching from index ${start}...`);
        let result = await getBatch(accountId, stop, pageSize, start);
        if (!result.length || result[result.length-1].id === minSeen) {
            console.timeEnd("**** Done fetching data, time taken: ");
            break;
        }
        minSeen = result[result.length-1].id;

        /* Before parsing results we need to know the block times */
        await resolveBlockTimes(result);

        /* Before parsing results we need to know the asset info (precision) */
        await resolveAssets(null, assets);
        await resolveAssets(result);

        /* Now that we have all assets, parse the balances properly */
        balances.forEach(b => {
            let amount = parseCurrency({amount: b.balance, asset_id: b.asset_type});
            accountBalances[amount.currency] = amount;
        })

        result.map(function(record) {
            const trx_id = record.id;
            let timestamp = blockData[record.block_num];
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

        start = opHistoryObject + (getIndex(minSeen) - 1);
    }

    doReport(recordData, accountId);
    disconnectFromChain();
}
doWork();
