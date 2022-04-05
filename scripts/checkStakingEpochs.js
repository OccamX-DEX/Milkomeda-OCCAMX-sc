const hre = require("hardhat");
const { utils } = require("ethers");
const { sleep } = require("./helpers");

async function main() {
    let stakingAddress;
    const [ deployer, user1, user2 ] = await hre.ethers.getSigners();

    console.log(`operating on network ${hre.network.name}`)
    if (hre.network.name == "milkomedaTestnet") {
        stakingAddress = "0xFD1E565D25F224a0360ff45ff8Bb73Fd0B0E2854";
    } else if (hre.network.name == "mainnet") {
    }

    console.log(`Deploying contracts with account: ${ deployer.address }`);

    console.log(`Account balance: ${ (await deployer.getBalance()).toString()}`);

    const StakingFactory = await hre.ethers.getContractFactory("Staking", deployer);
    const StakingInstance = await StakingFactory.attach(stakingAddress);

    const TokenFactory = await hre.ethers.getContractFactory("ProtocolToken", deployer);
    const rewardsTokenAddress = await StakingInstance.rewardsToken();
    const rewardsTokenInstance = await TokenFactory.attach(rewardsTokenAddress);
    const stakingTokenAddress = await StakingInstance.stakingToken();
    const stakingTokenInstance = await TokenFactory.attach(stakingTokenAddress);

    let newEpochTime = 1650406263;
    let newReward = utils.parseEther("0.01");

    /* await StakingInstance.updateSchedule(newEpochTime, newReward);

    await sleep(4); */

    /* // fund user 1, 2 with ETH
    await deployer.sendTransaction({
      to: user1.address,
      value: utils.parseEther("1.0"), // Sends exactly 1.0 ether
    });

    await deployer.sendTransaction({
      to: user2.address,
      value: utils.parseEther("1.0"), // Sends exactly 1.0 ether
    });

    // fund user 1, 2 with staking token

    await stakingTokenInstance.transfer(user1.address, utils.parseEther("20"));
    await stakingTokenInstance.transfer(user2.address, utils.parseEther("20")); */

    /* await stakingTokenInstance.connect(user1).approve(stakingAddress, utils.parseEther("1000"));
    await stakingTokenInstance.connect(user2).approve(stakingAddress, utils.parseEther("1000"));
    await sleep(4);

    await StakingInstance.connect(user1).stake(utils.parseEther("1")); */
    /* await StakingInstance.connect(user2).stake(utils.parseEther("3")); */

    // fund staking contract with reward tokens
    /* await rewardsTokenInstance.transfer(stakingAddress, utils.parseEther("10000")); */

    /* await StakingInstance.connect(user2).unstake(utils.parseEther("1"), 0);
 */
    await StakingInstance.connect(user1).getReward();
    await sleep(4);

    
    console.log(`user 1  staking token balance ${await stakingTokenInstance.balanceOf(user1.address)}`);
    console.log(`user 2  staking token balance ${await stakingTokenInstance.balanceOf(user2.address)}`);
    console.log(`deployer reward token balance ${await rewardsTokenInstance.balanceOf(deployer.address)}`);
    console.log(`deployer staking token balance ${await stakingTokenInstance.balanceOf(deployer.address)}`);
    console.log(`staking contract reward token balance ${await rewardsTokenInstance.balanceOf(stakingAddress)}`);
    console.log(`staking contract staking token balance ${await stakingTokenInstance.balanceOf(stakingAddress)}`);
    console.log(`check unstaking fee ratio ${await StakingInstance.unstakingFeeRatio()}`);
    console.log(`check emission schedule ${await StakingInstance.getCheckPoints()}`);
    console.log(`check reward per second ${await StakingInstance.getRewardPerSecond()}`);

}

main()
    .then(() => process.exit(0))
    .catch(error => {
    console.error(error);
    process.exit(1);
    });
