const hre = require("hardhat");
const {utils} = require("ethers");
const {sleep} = require("./helpers");

async function main() {


    console.log(`Operating in network ${hre.network.name}`)

    const [deployer] = await hre.ethers.getSigners();

    let factoryAddress, collectorAddress, zeroAddress;

    if (hre.network.name == "milkomedaTestnet") {
        factoryAddress = "0x428779a1A596c9cFdB68f5DaEf78b14901B95566";
        collectorAddress = "0x92A76FE5e70F4C9d44F6BD126ce61BFFB6563320";
        zeroAddress = "0x0000000000000000000000000000000000000000";
    } else if (hre.network.name == "milkomedaMainnet") {
        factoryAddress = "0x2ef06A90b0E7Ae3ae508e83Ea6628a3987945460";
        collectorAddress = "0x2324797D029E7192e62a4e758e8Ca3Aae74BF1EB";
        zeroAddress = "0x0000000000000000000000000000000000000000";
    } else {
        throw new Error(`network ${hre.network.name} is unsupported`);
    }

    console.log(
    "Deploying contracts with the account:",
    deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const DEXFactoryFactory = await ethers.getContractFactory("Factory");
    const DEXFactoryInstance = await DEXFactoryFactory.attach(factoryAddress);

    await DEXFactoryInstance.connect(deployer).setFeeTo(collectorAddress);
    await sleep(20);

    console.log(`fee to address is ${await DEXFactoryInstance.feeTo()}`);
    
    /* await sleep(150);
    await hre.run("verify:verify", {
        address: TokenInstance.address,
        constructorArguments: [supply, holder, tokenName, ticker],
    })
     */

}

main()
    .then(() => process.exit(0))
    .catch(error => {
    console.error(error);
    process.exit(1);
    });