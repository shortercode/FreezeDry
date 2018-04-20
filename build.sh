rollup -i ./src/index.js -f es -o freezedry.mjs
rollup -i ./freezedry.mjs -n freezedry -f umd -o freezedry.js