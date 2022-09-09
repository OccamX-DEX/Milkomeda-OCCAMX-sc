const { utils, BigNumber } = require("ethers");
const fs = require("fs");
const readline = require("readline");
const { exit } = require("process");

function sleep(s) {
    if (s > 0) {
        console.log(`Waiting for ${s} seconds`);
        return new Promise(resolve => setTimeout(resolve, s*1000));
    }
}

function getInputData (functionSig, functionName, args) {
    let ABI = [functionSig];
    let iface = new utils.Interface(ABI);
    return iface.encodeFunctionData(functionName, args);
}

function secondsSinceEpoch() {
    return Math.round(Date.now() / 1000);
}

function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}

function getRandomBigNumber(max) {
    return BigNumber.from(utils.randomBytes(32)).mod(max);
}

async function getCurrentBlock(provider) {
    let currentBlockNumber = await provider.getBlockNumber();
    let currentBlock = await provider.getBlock(currentBlockNumber);

    // loop to avoid provider.getBlockNumber caching bug
    while (currentBlock === null && currentBlockNumber >= 0) {
        currentBlockNumber--;
        currentBlock = await provider.getBlock(currentBlockNumber);
    }

    return currentBlock;
}

async function fastForwardTo(provider, timestamp) {
    let currentBlock = await getCurrentBlock(provider);
    let currentTime = currentBlock.timestamp;
    provider.send("evm_increaseTime", [timestamp - currentTime]);
    provider.send("evm_mine", []);
}

async function sendTxAndWait(contractInstance, sender, functionName, functionArgs) {
    const tx = await contractInstance.connect(sender)[functionName](...functionArgs);

    const txHash = tx.hash;

    while ((await hre.ethers.provider.getTransactionReceipt(txHash)) == null) {
        console.log(`waiting for transaction ${functionName} to be finished.`);
        await sleep(10);
    }

    const txReceipt = await hre.ethers.provider.getTransactionReceipt(txHash);

    console.log(`receipt for transaction ${functionName}`);
    console.log(txReceipt);
    console.log(`---------------------------------------`);
}

/**
 * Reads table from a .csv using the tab seperator.
 * Just because I get tabs when copying columns from google sheets.
 * @param {*} filePath Path to the file
 * @returns list of rows
 */
function getTableFromFile(filePath) {
    let table = [];
    let lines = fs.readFileSync(filePath, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.length > 0) {
            table.push(line.split("\t"));
        }
    }
    return table;
}

/**
 * Ask user for confirmation from command line. Ends the program if user does not enter "y"
 * @param {*} question Question to promt the user
 */
async function askUserConfirmation(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve, _) => {
        rl.question(question + " (y/n)", answer => {
            rl.close();
            if (answer == "y") {
                resolve();
            } else {
                exit();
            }
        });
    });
}

module.exports = { secondsSinceEpoch, getRandomInt, getRandomBigNumber, getInputData, sleep, getCurrentBlock, fastForwardTo, sendTxAndWait, getTableFromFile, askUserConfirmation };
