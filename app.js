const steem = require('steem');
const fs = require('fs');

if (process.argv.length < 3) {
  const path = require('path');
  let fileName = path.basename(__filename);
  console.log(`Usage: node ${fileName} userName`);
  process.exit();
}

const user = process.argv[2];

function getBatch(offset, size) {
  console.log(`Fetching ${size} items, with a max of ${offset}`);
  return new Promise((resolve, reject) => {
    steem.api.getAccountHistory(user, offset, size, function (err, result) {
      if (err) {
        reject(err);
      }
      resolve(result);
    });
  });
}

function parseCurrency(str) {
  let pieces = str.split(' ');
  return {
    amount: parseFloat(pieces[0]),
    currency: pieces[1]
  };
}

function steemPerMvests(timestamp) {
  const a = 2.1325476281078992e-05;
  const b = -31099.685481490847;

  const a2 = 2.9019227739473682e-07;
  const b2 = 48.41432402074669;

  if (timestamp < (b2-b)/(a-a2)) {
    return a * timestamp + b;
  } else {
    return a2 * timestamp + b2;
  }
}

function doReport(recordData) {
  let out = [];
  out.push([
    'ID',
    'Type',
    'Buy',
    'Buy Currency',
    'Sell',
    'Sell Currency',
    'Comment',
    'Account',
    'Date'
  ]);

  for (let trx_id of Object.keys(recordData)) {
    const {
      timestamp,
      type,
      data
    } = recordData[trx_id];
    switch (type) {
      case 'claim_reward_balance': {
        let steem = parseCurrency(data.reward_steem);
        if (steem.amount > 0) {
          out.push([
            trx_id + '-STEEM',
            'Income',
            steem.amount,
            steem.currency,
            '',
            '',
            'Claiming reward balance',
            'STEEM Blockchain',
            timestamp
          ]);
        }
        let sbd = parseCurrency(data.reward_sbd);
        if (sbd.amount > 0) {
          out.push([
            trx_id + '-SBD',
            'Income',
            sbd.amount,
            sbd.currency,
            '',
            '',
            'Claiming reward balance',
            'STEEM Blockchain',
            timestamp
          ]);
        }
        let vests = parseCurrency(data.reward_vests);
        if (vests.amount > 0) {
          let trxDate = Date.parse(timestamp)/1000;
          let calculatedSteem = steemPerMvests(trxDate) * (vests.amount/1000);
          out.push([
            trx_id + '-VEST',
            'Income',
            calculatedSteem,
            'STEEM',
            '',
            '',
            'Claiming reward balance',
            'STEEM Power',
            timestamp
          ]);
        }
        break;
      }
      case 'transfer': {
        let funds = parseCurrency(data.amount);
        if (data.to == user) {
          // Funds coming in to the account
          out.push([
            trx_id,
            'Deposit',
            funds.amount,
            funds.currency,
            '',
            '',
            `"From ${data.from}: ${data.memo}"`,
            'STEEM Blockchain',
            timestamp
          ]);
        } else {
          // Funds leaving the account
          out.push([
            trx_id,
            'Withdrawal',
            '',
            '',
            funds.amount,
            funds.currency,
            `"To ${data.to}: ${data.memo}"`,
            'STEEM Blockchain',
            timestamp
          ]);
        }
        break;
      }
      case 'fill_order': {
        if (data.open_owner == user) {
          // Someone filled our limit order
          let boughtFunds = parseCurrency(data.current_pays);
          let soldFunds = parseCurrency(data.open_pays);
          out.push([
            trx_id,
            'Trade',
            boughtFunds.amount,
            boughtFunds.currency,
            soldFunds.amount,
            soldFunds.currency,
            `Purchased from ${data.current_owner}`,
            'STEEM Blockchain',
            timestamp
          ]);
        } else {
          // We filled someone else's limit order
          let boughtFunds = parseCurrency(data.open_pays);
          let soldFunds = parseCurrency(data.current_pays);
          out.push([
            trx_id,
            'Trade',
            boughtFunds.amount,
            boughtFunds.currency,
            soldFunds.amount,
            soldFunds.currency,
            `Purchased from ${data.open_owner}`,
            'STEEM Blockchain',
            timestamp
          ]);
        }
        break;
      }
      case 'transfer_to_vesting': {
        if (data.from == user && data.to == user) {
          // Converted STEEM to STEEM Power
          let funds = parseCurrency(data.amount);
          out.push([
            trx_id,
            'Withdrawal',
            '',
            '',
            funds.amount,
            funds.currency,
            `To STEEM Power`,
            'STEEM Blockchain',
            timestamp
          ]);
          out.push([
            trx_id,
            'Deposit',
            funds.amount,
            funds.currency,
            '',
            '',
            `From STEEM`,
            'STEEM Power',
            timestamp
          ]);
        } else if (data.from == user) {
          let funds = parseCurrency(data.amount);
          out.push([
            trx_id,
            'Withdrawal',
            '',
            '',
            funds.amount,
            funds.currency,
            `To ${data.to} as STEEM Power`,
            'STEEM Blockchain',
            timestamp
          ]);
        } else {
          out.push([
            trx_id,
            'Deposit',
            funds.amount,
            funds.currency,
            '',
            '',
            `From ${data.from} STEEM`,
            'STEEM Power',
            timestamp
          ]);
        }
        break;
      }
    }
  }

  // Output the CSV
  fs.open('steem-transactions.csv', 'w', (err, fd) => {
    if (err) throw err;
    let contents = '';
    for (let line of out) {
      contents += line.join(',') + "\n";
    }
    fs.write(fd, contents, () => {
      console.log('Done writing report!');
    });
  });
}


async function doWork() {
  let pageSize = 50;
  let curIndex = 50;
  let maxSeen = 0;

  let recordData = {};

  while (true) {
    console.log(`Parsing from index ${curIndex}...`);
    let result = await getBatch(curIndex - 1, pageSize - 1);

    if (result[result.length-1][0] <= maxSeen) {
      console.log('Done fetching data!');
      break;
    }
    maxSeen = result[result.length-1][0];

    result.map(record => {
      const index = record[0];
      const {
        trx_id,
        timestamp
      } = record[1];
      const type = record[1].op[0];
      const data = record[1].op[1];
      switch (type) {
        case 'claim_reward_balance':
        case 'transfer':
        case 'fill_order':
        case 'transfer_to_vesting':
          recordData[trx_id] = {
            index,
            timestamp,
            type,
            data
          };
          break;
      }
    });

    curIndex += pageSize;
  }

  doReport(recordData);
}
doWork();
