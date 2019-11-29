const api = require("./api/nodeApi");

const accountHistoryApi = require("./api/getAccountHistory")(false);

const operations = require("bitsharesjs").ChainTypes.operations;

const ops = Object.keys(operations);

const fs = require("fs");

const utils = require("./utils");

const config = require("./config");

const {filterEntries, groupEntries, parseData} = require("./parser");

if (process.argv.length < 3) {
    const path = require("path");

    let fileName = path.basename(__filename);
    console.log(`Usage: node ${fileName} userName`);
    process.exit();
}

const user = process.argv[2];
const CHECK = process.argv[3] === "true";
const NO_GROUPING = process.argv[4] === "true";
const FILTER_TYPE = process.argv[5];
const FILTER_DATE = null; // new Date("2018-05-23").getTime();

const opHistoryObject = "1.11.";

async function doWork() {
    let pageSize = config.useES ? 150 : 50;
    let finalOp = 0;
    let minSeen;
    let recordData = {};
    let connect = await api.connect();
    console.log("\n____ " + user + " ____\n");
    console.log("Connected to network:", connect[0].network_name);
    if (config.useES)
        console.log(
            "Using Elastic Search for account history:",
            config.esNode,
            "\n"
        );
    const {accountId, balances, assets} = await api.getUser(user);
    console.log(user, "accountId", accountId);
    let start = opHistoryObject + "0";
    if (config.useES) start = 0;
    let stop = opHistoryObject + "0";
    console.time("**** Done fetching data, time taken: ");
    console.log(
        `**** FETCHING DATA FOR ${user}, THIS MAY TAKE SEVERAL MINUTES.... ****`
    );

    while (true) {
        // console.log(`Fetching from index ${start}...`);
        let result = config.useES
            ? await accountHistoryApi.getAccountHistoryES(
                  accountId,
                  pageSize,
                  start,
                  config.esNode
              )
            : await accountHistoryApi.getAccountHistory(
                  accountId,
                  stop,
                  pageSize,
                  start
              );

        if (!result.length || result[result.length - 1].id === minSeen) {
            console.timeEnd("**** Done fetching data, time taken: ");
            break;
        }

        minSeen = result[result.length - 1].id;
        /* Before parsing results we need to know the block times */

        await api.resolveBlockTimes(result);
        /* Before parsing results we need to know the asset info (precision) */

        await api.resolveAssets(null, assets);
        await api.resolveAssets(result);
        /* Now that we have all assets, parse the balances properly */
        // balances.forEach(b => {
        //     let amount = utils.parseCurrency({amount: b.balance, asset_id: b.asset_type});
        //     accountBalances[amount.currency] = amount;
        // })

        result.map(function(record) {
            const trx_id = record.id;
            let timestamp = api.getBlock(record.block_num);
            const type = ops[record.operation_type];
            const data = record.op;

            switch (type) {
                default:
                    recordData[trx_id] = {
                        timestamp,
                        type,
                        data
                    };
            }
        });
        if (config.useES) start += result.length;
        else start = opHistoryObject + (utils.getIndex(minSeen) - 1);
    }

    recordData = filterEntries(recordData, FILTER_TYPE, FILTER_DATE);
    /* Group fill_orders for the same market that are within one hour of each other */

    if (!NO_GROUPING) recordData = groupEntries(recordData);
    let parsedData = parseData(recordData, accountId, user);
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
        Object.keys(runningBalance).forEach(asset => {
            if (!runningBalance[asset][0]) return;
            runningBalance[asset].sort(
                (a, b) => a[2].getTime() - b[2].getTime()
            );
            runningBalance[asset][0].push(runningBalance[asset][0][1]);

            for (var i = 1; i < runningBalance[asset].length; i++) {
                runningBalance[asset][i].push(
                    runningBalance[asset][i][1] +
                        runningBalance[asset][i - 1][3]
                );
            }
        });
        console.log("");
        assetsToCheck.forEach(assetToCheck => {
            console.log(
                `**** Asset movement by type for ${assetToCheck}: ****\n`
            );
            getFinalBalance(assetToCheck);

            function getTotal(array) {
                let sum = 0;
                array.forEach(i => {
                    sum += i;
                });
                return sum;
            }

            if (movementTypes[assetToCheck]) {
                Object.keys(movementTypes[assetToCheck]).forEach(type => {
                    let deposit = getTotal(
                        movementTypes[assetToCheck][type].deposit
                    );
                    if (deposit > 0) console.log(type, "in :", deposit);
                    let out = getTotal(
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
    } // console.log("Fills", fills["STEEM"]);
    // Output the CSV

    if (CHECK) {
        assetsToCheck.forEach(assetToCheck => {
            fs.open(
                `output/${user}-${assetToCheck}-running-balances.csv`,
                "w",
                (err, fd) => {
                    if (err) throw err;
                    let contents = "";

                    for (let line of runningBalance[assetToCheck]) {
                        contents += line.join(",") + "\n";
                    }

                    fs.write(fd, contents, () => {
                        console.log(
                            `\nWrote running balance for ${assetToCheck} to file!`
                        );
                    });
                }
            );
        });
    }

    fs.open(`output/${user}-bts-transactions.csv`, "w", (err, fd) => {
        if (err) throw err;
        let contents = "";

        for (let line of parsedData) {
            contents += line.join(",") + "\n";
        }

        fs.write(fd, contents, () => {
            console.log("Done writing report!");
            console.log(
                "\n*******\nIf you're missing transactions, make sure the node you're connected to \nhas max-ops-per-account set to a high number (such as 100000)\n*******"
            );
        });
    });
    api.disconnect();
}

doWork();
