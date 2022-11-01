const hre = require("hardhat");
const {utils} = require("ethers");
const {sleep} = require("./helpers");

async function main() {

    let factoryAddress, WADAAddress, PTAddress;

    if (hre.network.name == "milkomedaTestnet") {
        factoryAddress = "0x428779a1A596c9cFdB68f5DaEf78b14901B95566";
        WADAAddress = "0x01BbBB9C97FC43e3393E860fc8BbeaD47B6960dB";
        PTAddress = "0xcE5eC4569b0ec9E9dE311dB566473234c337c443";
    } else if (hre.network.name == "milkomedaMainnet") {
        factoryAddress = "0x2ef06A90b0E7Ae3ae508e83Ea6628a3987945460";
        WADAAddress = "0xAE83571000aF4499798d1e3b0fA0070EB3A3E3F9";
        PTAddress = "0xf0c73E6287867bAa4F865A17EE711ec989c78AC0";
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

    const CollectorFactory = await ethers.getContractFactory("Collector");
    const CollectorInstance = await CollectorFactory.deploy(factoryAddress, PTAddress, WADAAddress);

    console.log("Collector address:", CollectorInstance.address);
    
    /* await sleep(120);
    await hre.run("verify:verify", {
        address: TokenInstance.address,
        constructorArguments: [],
    }); */
    

}

main()
    .then(() => process.exit(0))
    .catch(error => {
    console.error(error);
    process.exit(1);
    });