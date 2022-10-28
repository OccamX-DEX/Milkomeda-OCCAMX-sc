const hre = require("hardhat");
const {utils} = require("ethers");
const {sleep} = require("./helpers");

async function main() {

    let collectorAddress, stakingAddress;

    if (hre.network.name == "milkomedaTestnet") {
        collectorAddress = "0x92A76FE5e70F4C9d44F6BD126ce61BFFB6563320";
    } else if (hre.network.name == "milkomedaMainnet") {
        collectorAddress = "0x2324797D029E7192e62a4e758e8Ca3Aae74BF1EB";
    } 


    console.log(`Operating in network ${hre.network.name}`)

    const [deployer] = await hre.ethers.getSigners();

    console.log(
    "Deploying contracts with the account:",
    deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const CollectorInstance = await ethers.getContractAt("Collector", collectorAddress);

    /* await CollectorInstance.setLock(false); */
    console.log(await CollectorInstance.locked());
    await sleep(15);
    
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