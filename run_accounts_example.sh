rm ./output/*.csv

node app.js account1
node app.js account2

rm ./all-merged.csv
find . -type f -wholename '*output/*transactions.csv' -exec cat {} + >> all-merged.csv
