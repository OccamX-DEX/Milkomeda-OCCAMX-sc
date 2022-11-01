const hre = require("hardhat");
const {utils} = require("ethers");


async function main() {

    let factoryAddress, WADAAddress;

    if (hre.network.name == "milkomedaTestnet") {
        factoryAddress = "0x428779a1A596c9cFdB68f5DaEf78b14901B95566";
        WADAAddress = "0x01BbBB9C97FC43e3393E860fc8BbeaD47B6960dB";
    } else if (hre.network.name == "milkomedaMainnet") {
        factoryAddress = "0x2ef06A90b0E7Ae3ae508e83Ea6628a3987945460";
        WADAAddress = "0xAE83571000aF4499798d1e3b0fA0070EB3A3E3F9";
    } else {
        throw new Error(`network ${hre.network.name} is unsupported`);
    }


    console.log(`Operating in network ${hre.network.name}`)

    const [deployer] = await hre.ethers.getSigners();

    console.log(
    "Deploying contracts with the account:",
    deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const FactoryInstance = await ethers.getContractAt("Factory", factoryAddress);
    
    const allPairsLength = await FactoryInstance.allPairsLength();
    const pairIndex = allPairsLength - 1
    /* const lastPairAddress = await FactoryInstance.allPairs(pairIndex); */
    const lastPairAddress = "0xA7E93E4d51f9574af006ebBFDAa32BEF858c9693";

    console.log(`pair address ${lastPairAddress}`);

    const lastPair = await ethers.getContractAt("Pair", lastPairAddress);
    
    /* await sleep(150);
    await hre.run("verify:verify", {
        address: RouterInstance.address,
        constructorArguments: [factoryAddress, WADAAddress],
    }) */
    
    const lastPairToken0 = await lastPair.token0();
    const lastPairToken1 = await lastPair.token1();

    console.log(`token 0 ${lastPairToken0}`);
    console.log(`token 1 ${lastPairToken1}`);

    const Token0Instance = await ethers.getContractAt("ProtocolToken", lastPairToken0);
    const Token1Instance = await ethers.getContractAt("ProtocolToken", lastPairToken1);

    console.log(`token0 name ${await Token0Instance.name()}`);
    console.log(`token1 name ${await Token1Instance.name()}`);
    const token0Decimals = await Token0Instance.decimals();
    const token1Decimals = await Token1Instance.decimals();
    console.log(`token0 decimals ${token0Decimals}`);
    console.log(`token1 decimals ${token1Decimals}`);
    console.log(`token0 supply in pair ${await Token0Instance.balanceOf(lastPairAddress)}`);
    console.log(`token1 supply in pair ${await Token1Instance.balanceOf(lastPairAddress)}`);

}

main()
    .then(() => process.exit(0))
    .catch(error => {
    console.error(error);
    process.exit(1);
    });

// mainnet:
// USDT/milkADA LT 0xA74A72b796b94a215BF618b89C786b9240fd04EF, LM 0x52e5ab28e0e1ae31F47E641232E555E45aA1B633
// USDC/milkADA LT 0xB56964a0617b2b760C8B6D8040e99cda29D5203b, LM 0x7862cb7000219b7b6EDB3f19Be6146ac71f1bfeE
// wBTC/milkADA LT 0x2B5927056688961aF2B9321A3C54eA7805D86FD1, LM 0xD858B37Bc72A999D761d7F02C455Af33889527e3
