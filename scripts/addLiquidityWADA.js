const hre = require("hardhat");
const {utils, constants} = require("ethers");
const {sleep, sendTxAndWait} = require("./helpers");

async function main() {

    let routerAddress, tokenAddress, token2Address;

    if (hre.network.name == "milkomedaTestnet") {
        routerAddress = "0x472F4fEb99AC98098657f7341F4e04F28DCAD367";
        tokenAddress = "0xE41d2489571d322189246DaFA5ebDe1F4699F498";
    } if (hre.network.name == "milkomedaTestnet") {
        routerAddress = "0x472F4fEb99AC98098657f7341F4e04F28DCAD367";
        tokenAddress = "0xE41d2489571d322189246DaFA5ebDe1F4699F498";
        token2Address = "0x914f984D8766b9240185880c66D9547F62bEA9F2"
    } else {
        throw new Error(`network ${hre.network.name} is unsupported`);
    }

    const tokenAmount = utils.parseEther("30000");
    const wADAAmount = utils.parseEther("2");
    const slippage = 5; 

    const now = parseInt((new Date()).getTime()/1000);
    const deadline = now + 3600;

    console.log(`Operating in network ${hre.network.name}`)

    const [deployer] = await hre.ethers.getSigners();

    console.log(
    "Deploying contracts with the account:",
    deployer.address
    );
    
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const routerFactory = await ethers.getContractFactory("Router02");
    const routerInstance = await routerFactory.attach(routerAddress);
    const tokenInstance = await ethers.getContractAt("contracts/interfaces/IERC20.sol:IERC20", tokenAddress);

    const routerAllowance = await tokenInstance.allowance(deployer.address, routerAddress);

    if (routerAllowance < tokenAmount) {
        await sendTxAndWait(tokenInstance, deployer, "approve", [routerAddress, constants.MaxUint256]);
    }



    console.log(`token allowance of router from deployer is ${await tokenInstance.allowance(deployer.address, routerInstance.address)}`);

    const deployPairTx = await routerInstance.connect(deployer).addLiquidityADA(tokenAddress, 
                                                                             tokenAmount, 
                                                                             tokenAmount.mul(100 - slippage).div(100), 
                                                                             wADAAmount.mul(100 - slippage).div(100), deployer.address, 
                                                                             deadline,
                                                                             {value: wADAAmount});
    const deployPairTxHash = deployPairTx.hash;

    while ((await hre.ethers.provider.getTransactionReceipt(deployPairTxHash)) == null) {
        console.log(`waiting for deploy pair transaction to be finished.`);
        await sleep(10);
    };

    console.log(await hre.ethers.provider.getTransactionReceipt(deployPairTxHash));

    const factoryAddress = await routerInstance.factory();
    const factoryFactory = await ethers.getContractFactory("Factory");
    const factoryInstance = await factoryFactory.attach(factoryAddress);

    const pairAddress = await factoryInstance.getPair(tokenAddress, token2Address);
    console.log(`pair address is ${pairAddress}`);

}

main()
    .then(() => process.exit(0))
    .catch(error => {
    console.error(error);
    process.exit(1);
    });