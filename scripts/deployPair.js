const hre = require("hardhat");
const {utils} = require("ethers");

function sleep(s) {
    if (s > 0) {
        console.log(`Waiting for ${s} seconds`);
        return new Promise(resolve => setTimeout(resolve, s*1000));
    }
}

async function main() {

    let routerAddress, token1Address, token2Address;

    if (hre.network.name == "milkomedaTestnet") {
        routerAddress = "0x602153500e5f4F331044908249B1A6457Bd1a392";
        token1Address = "0xcE5eC4569b0ec9E9dE311dB566473234c337c443";
        token2Address = "0x01BbBB9C97FC43e3393E860fc8BbeaD47B6960dB";
        wADAAddress = "0x01BbBB9C97FC43e3393E860fc8BbeaD47B6960dB";
    } else if (hre.network.name == "rinkeby") {
        routerAddress = "0xc50d1FFBe387DBeA8F52233f027e5f683e4CF194";
        token1Address = "0x7f9966C63862C1C1Db9f9b044fe3EA13472eCbB8";
        token2Address = "0x8AC64eb44Cfe8A35D6D2A244C370eCd33Cb3e273";
        wADAAddress = "0x01BbBB9C97FC43e3393E860fc8BbeaD47B6960dB";
    } else if (hre.network.name == "milkomedaMainnet") {
        routerAddress = "0xe36B0C957Dd22d56F49e662fF49076C52d735d4c";
        token1Address = "0xd8B49eb03A37Cb586141Af941DCE58996Ed7ffdA";
        token2Address = "0x914f984D8766b9240185880c66D9547F62bEA9F2";
        wADAAddress = "0x01BbBB9C97FC43e3393E860fc8BbeaD47B6960dB";
    } else if (hre.network.name == "algoMilkomedaTestnet") {
        routerAddress = "0x3b70bEB2D1e0086775b4e41698Ccc1eB3B262853";
        token1Address = "0xbB69A30ADA91380a63cffd51e9C02FabCd160290";
        token2Address = "0x177c13E674b379fFad990bd1424926EeFab9300b";
        wADAAddress = "0xbB69A30ADA91380a63cffd51e9C02FabCd160290";
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
    const RouterInstance = await RouterFactory.attach(routerAddress);
    const Token1Instance = await ethers.getContractAt("contracts/interfaces/IERC20.sol:IERC20", token1Address);
    const Token2Instance = await ethers.getContractAt("contracts/interfaces/IERC20.sol:IERC20", token2Address);

    const token1Amount = ethers.utils.parseEther("1");
    const token2Amount = ethers.utils.parseEther("1");

    const wADAInstance = await ethers.getContractAt("IWADA", wADAAddress);

    if (token1Address === wADAAddress) {
        await wADAInstance.deposit({value: token1Amount});
    }

    if (token2Address === wADAAddress) {
        await wADAInstance.deposit({value: token2Amount});
    }

    await Token1Instance.connect(deployer).approve(RouterInstance.address, token1Amount.mul(2));
    await Token2Instance.connect(deployer).approve(RouterInstance.address, token2Amount.mul(2));

    await sleep(10);
    
    console.log(`token 1 balance of deployer is ${await Token1Instance.balanceOf(deployer.address)}`);
    console.log(`token 2 balance of deployer is ${await Token2Instance.balanceOf(deployer.address)}`);

    console.log(`token 1 allowance of router from deployer is ${await Token1Instance.allowance(deployer.address, RouterInstance.address)}`);
    console.log(`token 2 allowance of router from deployer is ${await Token2Instance.allowance(deployer.address, RouterInstance.address)}`);


    

    const deployPairTx = await RouterInstance.connect(deployer).addLiquidity(token1Address, token2Address, token1Amount, token2Amount, 0, 0, deployer.address, 1000000000000000, { gasLimit: 9999999});

    const deployPairTxHash = deployPairTx.hash;

    while ((await hre.ethers.provider.getTransactionReceipt(deployPairTxHash)) == null) {
        console.log(`waiting for deploy pair transaction to be finished.`);
        await sleep(10);
    };

    console.log(await hre.ethers.provider.getTransactionReceipt(deployPairTxHash));




    
    /* await sleep(150);
    await hre.run("verify:verify", {
        address: TokenInstance.address,
        constructorArguments: [supply, holder, tokenName, ticker],
    }) */
    

}

main()
    .then(() => process.exit(0))
    .catch(error => {
    console.error(error);
    process.exit(1);
    });