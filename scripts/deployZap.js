const hre = require("hardhat");
const {utils} = require("ethers");
const { sleep, getInputData } = require("./helpers");
const { ethers } = require("hardhat");

/**
 * Deployment script for the zap contract
 * It creates the contract on-chain with the given parameters
 * and then runs a simple test to verify that it works.
 */
async function main() {
    
    // PARAMS Start
    let routerAddress, wAdaAddress, testPairAddress, testAdaAmount;
    if (hre.network.name == "milkomedaMainnet") {
        routerAddress = "0x9CdcE24c0e67611B698E6C228BF7791D4ECc553A";
        wAdaAddress = "0xAE83571000aF4499798d1e3b0fA0070EB3A3E3F9";
        testPairAddress = "0x354EB6D82f8fb60b12839A5C693d82BDCcb917bF"; // madUSDC-mADA
        testAdaAmount = utils.parseEther("0.001");
        testStakingAddr = "0xe2a525ac8b8d69a0bd28fb45e9dfe52e96c85b32";
    } else if (hre.network.name == "milkomedaTestnet") {
        routerAddress = "0x602153500e5f4F331044908249B1A6457Bd1a392";
        wAdaAddress = "0x01BbBB9C97FC43e3393E860fc8BbeaD47B6960dB";
        testPairAddress = "0x8578aBC9e5De03a96CEEc3339C7315735470Fd4F";
        testAdaAmount = utils.parseEther("0.001");
        testStakingAddr = ethers.constants.AddressZero;
    } else if (hre.network.name == "algoMilkomedaTestnet") {
        routerAddress = "0x3b70bEB2D1e0086775b4e41698Ccc1eB3B262853";
        wAdaAddress = "0xbB69A30ADA91380a63cffd51e9C02FabCd160290";
        testPairAddress = "0x0E518a8C39EbAA88cb092454caF31C425e32Be43";
        testAdaAmount = utils.parseEther("0.001");
        testStakingAddr = ethers.constants.AddressZero;
    } else {
        console.log("No parameters set for network", hre.network.name);
        return;
    }
    // PARAMS End

    console.log(`Operating in network ${hre.network.name}`)
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    let pair = await ethers.getContractAt("Pair", testPairAddress);
    let staking = await ethers.getContractAt("StakingImp", testStakingAddr);

    const zapFactory = await hre.ethers.getContractFactory('ZapOccamX', deployer);
    let zap = await zapFactory.deploy(routerAddress, wAdaAddress);
    console.log("Zap address:", zap.address);
        
    console.log("Testing zap on pair", testPairAddress);
    console.log(`Holding ${await pair.balanceOf(deployer.address)} liquidity tokens before zap`);
    if (testStakingAddr != ethers.constants.AddressZero){
        console.log("Afterwards staking on ", testStakingAddr);
        console.log(`Having ${await staking.stakes(deployer.address)} liquidity tokens staked before zap`);
    }
    
    console.log("Executing test zap");
    let tx = await zap.zapInADA(testPairAddress, 0, testStakingAddr, {value: testAdaAmount});

    console.log("waiting for 5 confirmations");
    await tx.wait(5);
    console.log(`Holding ${await pair.balanceOf(deployer.address)} liquidity tokens after zap`);
    if (testStakingAddr != ethers.constants.AddressZero){
        console.log(`Having ${await staking.stakes(deployer.address)} liquidity tokens staked after zap`);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
    console.error(error);
    process.exit(1);
    });