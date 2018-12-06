const bts = require("bitsharesjs-ws");
let fetchClient;

module.exports = function(isBrowser) {
    if (isBrowser) fetchClient = fetch;
    else {
        fetchClient = require("node-fetch");
    }

    function getAccountHistoryES(
        account_id,
        limit,
        start,
        esNode = "https://eswrapper.bitshares.eu"
    ) {
        console.log(
            "query",
            `${esNode}/get_account_history?account_id=${account_id}&from_=${start}&size=${limit}&sort_by=block_data.block_time&type=data&agg_field=operation_type`
        );
        return new Promise((resolve, reject) => {
            fetchClient(
                `${esNode}/get_account_history?account_id=${account_id}&from_=${start}&size=${limit}&sort_by=block_data.block_time&type=data&agg_field=operation_type`
            )
                .then(res => res.json())
                .then(result => {
                    let ops = result.map(r => {
                        if ("amount_" in r.operation_history.op_object) {
                            r.operation_history.op_object.amount =
                                r.operation_history.op_object.amount_;
                        }
                        return {
                            id: r.account_history.operation_id,
                            op: r.operation_history.op_object,
                            operation_type: r.operation_type,
                            result: JSON.parse(
                                r.operation_history.operation_result
                            ),
                            block_num: r.block_data.block_num,
                            block_time: r.block_data.block_time + "Z"
                        };
                    });
                    resolve(ops);
                })
                .catch(err => {
                    console.log("getAccountHistory errror:", err);
                    resolve([]);
                });
        });
    }

    function getAccountHistory(account_id, stop, limit, start) {
        return new Promise((resolve, reject) => {
            bts.Apis.instance()
                .history_api()
                .exec("get_account_history", [account_id, stop, limit, start])
                .then(operations => {
                    resolve(operations);
                })
                .catch(reject);
        });
    }

    return {
        getAccountHistory,
        getAccountHistoryES
    };
};
