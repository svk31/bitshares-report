rm ./output/*.csv

npm start account1
npm start account2

rm ./all-merged.csv
find . -type f -wholename '*output/*transactions.csv' -exec cat {} + >> all-merged.csv
