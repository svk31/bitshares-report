rm ./output/*.csv

yarn start account1
yarn start account2

rm ./all-merged.csv
find . -type f -wholename '*output/*transactions.csv' -exec cat {} + >> all-merged.csv
