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
    } else if (hre.network.name == "algoMilkomedaTestnet") {
        factoryAddress = "0xa4E0d03d258D617228A4fCc7823BF4e58377703D";
        WADAAddress = "0xbB69A30ADA91380a63cffd51e9C02FabCd160290";
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

    const RouterFactory = await ethers.getContractFactory("Router02");
    const RouterInstance = await RouterFactory.deploy(factoryAddress, WADAAddress);

    console.log("Router address:", RouterInstance.address);
    
    /* await sleep(150);
    await hre.run("verify:verify", {
        address: RouterInstance.address,
        constructorArguments: [factoryAddress, WADAAddress],
    }) */
    

}

main()
    .then(() => process.exit(0))
    .catch(error => {
    console.error(error);
    process.exit(1);
    });