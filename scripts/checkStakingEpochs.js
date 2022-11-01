const hre = require("hardhat");
const { utils } = require("ethers");
const { sleep, getTableFromFile, askUserConfirmation } = require("./helpers");
const { ethers } = require("hardhat");

async function main() {
    // Main parameters for epoch update
    const newEpochEndDate = dateFromString("2022-07-20T18:00:00.000Z");
    // Read staking contracts and rewards per second from table (copied from google sheet) 
    let newRewardData = getTableFromFile("scripts/LMInfo.csv");

    
    let newEpochEndTimestamp = newEpochEndDate.getTime() / 1000;
    await askUserConfirmation("Update the epoch end date to " + newEpochEndDate.toString() + "?");
    console.log(`Unix timestamp: ${newEpochEndTimestamp}`);

    let stakingAddress;
    const [ deployer, user1, user2 ] = await hre.ethers.getSigners();

    console.log(`Deploying contracts with account: ${ deployer.address }`);

    console.log(`Account balance: ${ (await deployer.getBalance()).toString()}`);

    const StakingFactory = await hre.ethers.getContractFactory("StakingImp", deployer);
    const TokenFactory = await hre.ethers.getContractFactory("ProtocolToken", deployer);

    // confirm all staking addresses
    for (let i = 0; i < newRewardData.length; i++) {
        let lmContract = newRewardData[i][0];
        let newReward = utils.parseEther(newRewardData[i][1]);

        let StakingInstance = await StakingFactory.attach(lmContract);
        let pastRewardList = await StakingInstance.getRewardPerSecond();
        let currentRewards = pastRewardList[pastRewardList.length - 1];

        let note = currentRewards.toString() == newReward.toString() 
            ? "(same rewards)" 
            : `(instead of ${utils.formatEther(currentRewards)})`;

        await askUserConfirmation(`Update the reward for ${lmContract} to ${utils.formatEther(newReward)} ${note}?`);
    }

    if (hre.network.name == "milkomedaMainnet") {
        for (let i = 0; i < newRewardData.length; i++) {

            let reward = utils.parseEther(newRewardData[i][1]);
            stakingAddress = newRewardData[i][0];

            console.log(`setting epochs for staking address ${stakingAddress}`);

            StakingInstance = await StakingFactory.attach(stakingAddress);
            let rewardsTokenAddress = await StakingInstance.rewardsToken();
            let rewardsTokenInstance = await TokenFactory.attach(rewardsTokenAddress);
            let stakingTokenAddress = await StakingInstance.stakingToken();
            let stakingTokenInstance = await TokenFactory.attach(stakingTokenAddress);
            console.log(await StakingInstance.getRewardPerSecond());
            console.log(`reward token address is ${await rewardsTokenInstance.name()}`);
            console.log(`staking token address is ${await stakingTokenInstance.name()}`);

            let firstTx = await StakingInstance.updateSchedule(newEpochEndTimestamp, reward);
            let firstTxHash = firstTx.hash;

            while ((await hre.ethers.provider.getTransactionReceipt(firstTxHash)) == null) {
                console.log(`waiting for the first set schedule transaction to be finished.`);
                await sleep(10);
            }

            console.log(`check block explorer: https://explorer-mainnet-cardano-evm.c1.milkomeda.com/address/${stakingAddress}/read-proxy`)
            console.log(`------------------------`)
        }
    } else {
        throw new Error(`network ${hre.network.name} is unsupported`);
    }
}

function dateFromString(dateString) {
    return new Date(Date.parse(dateString));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
    console.error(error);
    process.exit(1);
    });
