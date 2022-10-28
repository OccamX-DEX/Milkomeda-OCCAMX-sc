const hre = require("hardhat");
const {utils} = require("ethers");
const {sleep} = require("./helpers");

async function main() {

    let collectorAddress;

    if (hre.network.name == "milkomedaTestnet") {
        collectorAddress = "0x92A76FE5e70F4C9d44F6BD126ce61BFFB6563320";
    } else if (hre.network.name == "milkomedaMainnet") {
        collectorAddress = "0x2324797D029E7192e62a4e758e8Ca3Aae74BF1EB";
    } 


    console.log(`Operating in network ${hre.network.name}`)

    const [deployer] = await hre.ethers.getSigners();

    console.log(
    "Managing contracts with the account:",
    deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const CollectorInstance = await ethers.getContractAt("Collector", collectorAddress);

    const poolsToBB = ["0xA4AD48A0b25460d31aE12291620fB063E1A6Db13"];
    
    for (const poolAddress of poolsToBB) {
        const poolInstance = await ethers.getContractAt("Pair", poolAddress);
        const token0 = await poolInstance.token0();
        const token1 = await poolInstance.token1();
        const LTBalance = await poolInstance.balanceOf(CollectorInstance.address);
        console.log(`working with pool ${poolAddress} and tokens ${token0}, ${token1}`);
        console.log(`collector LT balance is ${LTBalance}`);
        await CollectorInstance.convert(token0, token1, {gasLimit: 500000});
        console.log(`performing buyback`);
        await sleep(15);
    }
    

}

main()
    .then(() => process.exit(0))
    .catch(error => {
    console.error(error);
    process.exit(1);
    });