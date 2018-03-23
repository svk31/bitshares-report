const steem = require('steem');

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

function doReport(recordData) {
  for (let trx_id of Object.keys(recordData)) {
    const {
      timestamp,
      type,
      data
    } = recordData[trx_id];

    console.log(`${timestamp}: ${type}`);
    console.log(data);
    console.log('');
  }
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


      recordData[trx_id] = {
        index,
        timestamp,
        type,
        data
      };
    });

    curIndex += pageSize;
  }

  doReport(recordData);
}
doWork();
