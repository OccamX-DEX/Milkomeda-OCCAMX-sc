const hre = require("hardhat");
const { utils } = require("ethers");
const { sleep, getInputData } = require("./helpers");

async function main() {
    let proxyOwner, admin, stakingTokenAddress, unstakingFeeRatio, emissionStart, firstCheckPoint, rewardPerSecond, feeBurn, rewardsTokenAddress;
    const [ deployer ] = await hre.ethers.getSigners();

    console.log(`operating on network ${hre.network.name}`)
    if (hre.network.name == "milkomedaTestnet") {
        admin = deployer.address;
        rewardsTokenAddress = "0xcE5eC4569b0ec9E9dE311dB566473234c337c443"; //OCX
        stakingTokenAddress = "0x30aa7F615E8540f05a9707dE00E95469D77be613"; //OCX
        unstakingFeeRatio = 0;
        emissionStart = 0;
        firstCheckPoint = 1620133780;
        rewardPerSecond = 0;
        feeBurn = false;
    } else if (hre.network.name == "mainnet") {
        proxyOwner = "0x865d9eb17D84167745A4931F9b254B0764fDd0f6";
        logicsOwner = "0x865d9eb17D84167745A4931F9b254B0764fDd0f6";
        stakingTokenAddress = "0x2f109021afe75b949429fe30523ee7c0d5b27207";
        unstakingFeeRatio = 400;
        // !!! Check timelock for both unstaking fee and implemetation change
        emissionStart = 1649872800;
        firstCheckPoint = 1651082400;
        rewardPerSecond = utils.parseEther("0.004571119302556900");
    } else if (hre.network.name == "milkomedaMainnet") {
        proxyOwner = "0x394195f788541166DFf932a828455a8a940d75d4";
        logicsOwner = deployer.address;
        rewardsTokenAddress = "0xf0c73E6287867bAa4F865A17EE711ec989c78AC0"; // This should be OCX
        stakingTokenAddress = "0xe0A8fec6Ae57d3634FD7D3571DeC53912729c991"; // TODO: put LT address here
        unstakingFeeRatio = 0;
        // !!! Check timelock for both unstaking fee and implemetation change
        emissionStart = 1652292000; // TODO: update
        firstCheckPoint = 1653501600; // TODO: update
        rewardPerSecond = utils.parseEther("0.002493779144295280"); // TODO: set for each LM to deploy
        feeBurn = false;
    } else if (hre.network.name == "algoMilkomedaTestnet") {
        proxyOwner = deployer.address;
        logicsOwner = deployer.address;
        rewardsTokenAddress = "0x177c13E674b379fFad990bd1424926EeFab9300b";
        stakingTokenAddress = "0x0E518a8C39EbAA88cb092454caF31C425e32Be43";
        unstakingFeeRatio = 0;
        // !!! Check timelock for both unstaking fee and implemetation change
        emissionStart = 1649872800;
        firstCheckPoint = 1651082400;
        rewardPerSecond = utils.parseEther("0.004571119302556900");
        feeBurn = false;
    } else {
        throw new Error(`network ${hre.network.name} is unsupported`);
    }
        

    console.log(`Deploying contracts with account: ${ deployer.address }`);

    console.log(`Account balance: ${ (await deployer.getBalance()).toString()}`);

    const StakingImpFactory = await hre.ethers.getContractFactory("StakingImp", deployer);

    const StakingImpInstance = await StakingImpFactory.deploy();

    const StakingImpAddress = StakingImpInstance.address;
    console.log(`StakingImp address: ${StakingImpAddress}`);
    console.log(`deployed from address ${StakingImpInstance.deployTransaction.from}`);

    const stakingImpDeployTxHash = StakingImpInstance.deployTransaction.hash;

    while ((await hre.ethers.provider.getTransactionReceipt(stakingImpDeployTxHash)) == null) {
        console.log(`waiting for staking implementation deployment to be finished.`);
        await sleep(10);
    }
    const stakingImpDeployReceipt = await hre.ethers.provider.getTransactionReceipt(stakingImpDeployTxHash);

    console.log(`staking implementation deployment is finished`);
    console.log(`gas used ${stakingImpDeployReceipt.gasUsed}`);

    const CONTRACT_ARGS = [rewardsTokenAddress, stakingTokenAddress, emissionStart, firstCheckPoint, rewardPerSecond, logicsOwner, feeBurn, unstakingFeeRatio];


    const initializationData = getInputData("function initialize(address _rewardsToken, address _stakingToken, uint emissionStart, uint firstCheckPoint, uint _rewardPerSecond, address admin, bool _feeBurn, uint _unstakingFeeRatio)",
                                            "initialize",
                                            CONTRACT_ARGS);
    console.log(`initialization data for validation: ${initializationData}`);

    const ProxyFactory = await hre.ethers.getContractFactory("UpgradeabilityProxy", deployer);

    const ProxyInstance = await ProxyFactory.deploy(proxyOwner, StakingImpAddress, initializationData, true);

    const proxyDeployTxHash = ProxyInstance.deployTransaction.hash;

    while ((await hre.ethers.provider.getTransactionReceipt(proxyDeployTxHash)) == null) {
        console.log(`waiting for proxy deployment to be finished.`);
        await sleep(10);
    }
    const proxyDeployReceipt = await hre.ethers.provider.getTransactionReceipt(proxyDeployTxHash);
    console.log(`proxy deployment is finished`);
    console.log(`gas used ${proxyDeployReceipt.gasUsed}`)

    const ProxyAddress = ProxyInstance.address;
    console.log(`Proxy address: ${ProxyAddress}`);
    console.log(`deployed from address ${ProxyInstance.deployTransaction.from}`);
 
    const StakingProxy = await StakingImpFactory.attach(ProxyAddress);
    
    console.log(`----------`);
    console.log(`Input parameters`);
    console.log(`rewards token address ${rewardsTokenAddress}`);
    console.log(`staking token address ${stakingTokenAddress}`);
    console.log(`unstaking fee ratio ${unstakingFeeRatio/10000}`);
    console.log(`logics owner ${logicsOwner}`);
    console.log(`emission start ${emissionStart}`);
    console.log(`first checkpoint ${firstCheckPoint}`);
    console.log(`reward per second ${rewardPerSecond}`);
    console.log(`proxy owner ${proxyOwner}`);
    console.log(`-----------`);
    console.log(`Onchain parameters`);
    console.log(`check initialized ${await StakingProxy.initialized()}`);
    console.log(`check rewards token address ${await StakingProxy.rewardsToken()}`);
    console.log(`check staking token address ${await StakingProxy.stakingToken()}`);
    console.log(`check unstaking fee ratio ${(await StakingProxy.unstakingFeeRatio())/10000}`);
    console.log(`check logics owner ${await StakingProxy.owner()}`);
    console.log(`check emission schedule ${await StakingProxy.getCheckPoints()}`);
    console.log(`check reward per second ${await StakingProxy.getRewardPerSecond()}`);
    console.log(`check proxy owner ${await ProxyInstance.proxyOwner()}`); 
    console.log(`check time lock period ${await ProxyInstance.timelockPeriod()}`);
    console.log(`check unstaking fee time lock period ${await StakingProxy.unstakingFeeRatioTimelockPeriod()}`);
    console.log(`-----------`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
    console.error(error);
    process.exit(1);
    });
