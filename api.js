const config = require("./config");
const bts = require('bitsharesjs-ws');
const fetch = require("node-fetch");
const fs = require("fs");
let blockData = require("./blockData.json");
let assetData = require("./assetData.json");
const operations = require("bitsharesjs").ChainTypes.operations;
const ops = Object.keys(operations);

function precisionToRatio(p) {
    if (typeof p !== "number") throw new Error("Input must be a number");
    return Math.pow(10, p);
}

function connect() {
    return new Promise((resolve) => {
        bts.Apis.instance(config.apiNode, true).init_promise.then(resolve).catch((err => {
            console.error("Error connection to node:", err);
        }));
    });
}

function disconnect() {
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
    if (config.useES) {
        console.log("query", `${config.esNode}/get_account_history?account_id=${account_id}&from_=${start}&size=${limit}&sort_by=block_data.block_time&type=data&agg_field=operation_type`)
        return new Promise((resolve, reject) => {
            fetch(`${config.esNode}/get_account_history?account_id=${account_id}&from_=${start}&size=${limit}&sort_by=block_data.block_time&type=data&agg_field=operation_type`)
            .then(res => res.json())
            .then(result => {
                let ops = result.map(r => {
                    return {
                        id: r.account_history.operation_id,
                        op: JSON.parse(r.operation_history.op),
                        result: JSON.parse(r.operation_history.operation_result),
                        block_num: r.block_data.block_num,
                        block_time: r.block_data.block_time
                    }
                })
                resolve(ops);
            }).catch(() => {
                resolve([]);
            });
        })
    }

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

function getAsset(id) {
    return assetData[id];
}

function getBlock(block_num) {
    return blockData[block_num];
}

module.exports = {
    connect,
    disconnect,
    getUser,
    getBlockTime,
    getAssetData,
    resolveAssets,
    resolveBlockTimes,
    getBatch,
    getAsset,
    getBlock
}
