import { ethers } from 'hardhat';
import chai, { use } from 'chai';
import { solidity } from 'ethereum-waffle';

chai.config.includeStack = true;

import { WETH9 } from '../typechain/WETH9';
import { Factory } from '../typechain/Factory';
import { Pair } from '../typechain/Pair';
import { Router02 } from '../typechain/Router02';
import { MockCoin } from '../typechain/MockCoin';
import { StakingImp } from '../typechain/StakingImp';
import { Collector } from '../typechain/Collector';

import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { BigNumber, ContractTransaction, providers, utils } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { isBytes } from '@ethersproject/bytes';
import { ZlibParams } from 'zlib';

const fs = require('fs');
const hre = require('hardhat');

chai.use(solidity);
const { expect } = chai;

describe('Collector', () => {
  let protocolCoin: MockCoin;
  let coin1: MockCoin;
  let coin2: MockCoin;
  let liquidity1: BigNumber;
  let liquidity2: BigNumber;
  let liquidityWAda: BigNumber;
  let liquidityPT: BigNumber;
  let factory: Factory;
  let twoTokenPair: Pair;
  let tokenWAdaPair: Pair;
  let tokenPTPair: Pair;
  let PTWAdaPair: Pair;
  let router: Router02;
  let wADA: WETH9;
  let staking: StakingImp;
  let collector: Collector;
  

  let deployer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async () => {
    [deployer, user1, user2] = await ethers.getSigners();

    // DEPLOY & SETUP all the stuff we need for testing (tokens, weth, factory, pairs, router)
    const coinFactory = await ethers.getContractFactory('MockCoin', deployer);
    coin1 = (await coinFactory.deploy('One', '1ONE')) as MockCoin;
    liquidity1 = utils.parseEther('200');
    coin2 = (await coinFactory.deploy('Two', '2TWO')) as MockCoin;
    liquidity2 = utils.parseEther('200');
    protocolCoin = (await coinFactory.deploy(
      'ProtocolToken',
      'PT'
    )) as MockCoin;
    liquidityPT = utils.parseEther('200');

    // wADA is for wrapped ADA on Milkomeda, so it is the WETH equivalent
    const wAdaFactory = await hre.ethers.getContractFactory('WETH9', deployer);
    wADA = (await wAdaFactory.deploy()) as WETH9;
    liquidityWAda = utils.parseEther('200');

    const factoryFactory = await hre.ethers.getContractFactory(
      'Factory',
      deployer
    );
    factory = await factoryFactory.deploy(deployer.address);
    await factory.deployed();

    // deploy collector and set it as fee getter of the DEX
    const collectorFactory = await hre.ethers.getContractFactory(
      'Collector',
      deployer
    );
    collector = (await collectorFactory.deploy(
      factory.address,
      protocolCoin.address,
      wADA.address
    )) as Collector;
    await factory.connect(deployer).setFeeTo(collector.address);

    const routerFactory = await hre.ethers.getContractFactory('Router02');
    router = await routerFactory.deploy(factory.address, wADA.address);

    // we want to test with four types of pair: token-token, token-wada, wada-PT, token-PT
    let pairInterface = JSON.parse(
      fs.readFileSync('./artifacts/contracts/Pair.sol/Pair.json')
    )['abi'];
    await factory.createPair(coin1.address, coin2.address);
    const addressTwoTokenPair = await factory.getPair(
      coin1.address,
      coin2.address
    );
    twoTokenPair = new hre.ethers.Contract(
      addressTwoTokenPair,
      pairInterface,
      deployer
    ) as Pair;
    await coin1.mint(deployer.address, liquidity1);
    await coin2.mint(deployer.address, liquidity2);
    await coin1.connect(deployer).approve(router.address, liquidity1);
    await coin2.connect(deployer).approve(router.address, liquidity2);
    await router
      .connect(deployer)
      .addLiquidity(
        coin1.address,
        coin2.address,
        liquidity1,
        liquidity2,
        0,
        0,
        deployer.address,
        1000000000000000
      );

    await factory.createPair(wADA.address, coin1.address);
    const addressTokenWAdaPair = await factory.getPair(
      wADA.address,
      coin1.address
    );
    tokenWAdaPair = new hre.ethers.Contract(
      addressTokenWAdaPair,
      pairInterface,
      deployer
    ) as Pair;
    await coin1.mint(deployer.address, liquidity1);
    await coin1.connect(deployer).approve(router.address, liquidity1);
    await router
      .connect(deployer)
      .addLiquidityADA(
        coin1.address,
        liquidity1,
        0,
        0,
        deployer.address,
        1000000000000000,
        { value: liquidityWAda }
      );


    await factory.createPair(coin2.address, protocolCoin.address);
    const addressTokenPTPair = await factory.getPair(
      coin2.address,
      protocolCoin.address
    );
    tokenPTPair = new hre.ethers.Contract(
      addressTokenPTPair,
      pairInterface,
      deployer
    ) as Pair;
    await coin2.mint(deployer.address, liquidity2);
    await protocolCoin.mint(deployer.address, liquidityPT);
    await coin2.connect(deployer).approve(router.address, liquidity2);
    await protocolCoin.connect(deployer).approve(router.address, liquidityPT);
    await router
      .connect(deployer)
      .addLiquidity(
        coin2.address,
        protocolCoin.address,
        liquidity2,
        liquidityPT,
        0,
        0,
        deployer.address,
        1000000000000000
      );

    await factory.createPair(wADA.address, protocolCoin.address);
    const addressPTWAdaPair = await factory.getPair(
      wADA.address,
      protocolCoin.address
    );
    PTWAdaPair = new hre.ethers.Contract(
      addressPTWAdaPair,
      pairInterface,
      deployer
    ) as Pair;
    await protocolCoin.mint(deployer.address, liquidityPT);
    await protocolCoin.connect(deployer).approve(router.address, liquidityPT);
    await router
      .connect(deployer)
      .addLiquidityADA(
        protocolCoin.address,
        liquidityPT,
        0,
        0,
        deployer.address,
        1000000000000000,
        { value: liquidityWAda }
      );

    // staking has protocol token as both staking token and reward token
    const stakingFactory = await hre.ethers.getContractFactory(
      'StakingImp',
      deployer
    );
    staking = (await stakingFactory.deploy()) as StakingImp;
    await staking.initialize(
      protocolCoin.address,
      protocolCoin.address,
      1,
      0,
      1,
      deployer.address,
      false,
      0
    );

    await collector.setStakingContract(staking.address);
    await collector.connect(deployer).setLock(false);
    await collector.connect(deployer).setBridge(coin2.address, protocolCoin.address);
  });


  afterEach(async () => {
    // check that there is no protocol token after buy back from the collector SC
    expect(await protocolCoin.balanceOf(collector.address)).to.eq(0);
  });

  it('should construct the collector contract', async () => {
    expect(collector.address).to.properAddress;
    expect(await collector.PToken()).to.be.equal(protocolCoin.address);
    expect(await factory.feeTo()).to.be.eq(collector.address);
    
  });

  it('should collect fee from the token-token pair', async () => {
    // make a swap from coin1 to coin2
    const swapAmount = utils.parseEther('10');
    await coin1.mint(user1.address, swapAmount);
    await coin1.connect(user1).approve(router.address, swapAmount);

    const path = [coin1.address, coin2.address];

    await router
      .connect(user1)
      .swapExactTokensForTokens(
        swapAmount,
        0,
        path,
        user1.address,
        1000000000000000
      );

    // now the user1 also makes a liquidity addition to trigger the transfer of fee LT from the pool to the collector contract
    const LTAmount1 = utils.parseEther('20');
    await coin1.mint(user1.address, LTAmount1);
    await coin1.connect(user1).approve(router.address, LTAmount1);
    const LTAmount2 = utils.parseEther('20');
    await coin2.mint(user1.address, LTAmount2);
    await coin2.connect(user1).approve(router.address, LTAmount2);

    const collectorLTBalanceBefore = await twoTokenPair.balanceOf(
      collector.address
    );

    await router
      .connect(user1)
      .addLiquidity(
        coin1.address,
        coin2.address,
        LTAmount1,
        LTAmount2,
        0,
        0,
        user1.address,
        1000000000000000
      );

    const collectorLTBalanceAfter = await twoTokenPair.balanceOf(
      collector.address
    );
    // fee LT should be transferred to the collector contract
    expect(await collectorLTBalanceAfter).to.be.gt(collectorLTBalanceBefore);

    // now we buy back protocol token using the LT of coin1 and coin2 inside the collector
    const stakingContractPTBalanceBefore = await protocolCoin.balanceOf(staking.address);

    await expect(collector.connect(user1).convert(coin1.address, coin2.address)).to.be.revertedWith("Ownable: caller is not the owner");

    await collector.connect(deployer).convert(coin1.address, coin2.address);

    const stakingContractPTBalanceAfter = await protocolCoin.balanceOf(staking.address);

    // staking contract should receive the protocol token
    expect(stakingContractPTBalanceAfter).to.be.gt(stakingContractPTBalanceBefore);

    // there should be no protocol token in the collector contract
    expect(await protocolCoin.balanceOf(collector.address)).to.be.eq(0);

  });
  it('should collect fee from the PT-wADA pair', async () => {
    // make a swap from PT to wADA
    const swapAmount = utils.parseEther('10');
    await protocolCoin.mint(user1.address, swapAmount);
    await protocolCoin.connect(user1).approve(router.address, swapAmount);

    const path = [protocolCoin.address, wADA.address];
    await router
      .connect(user1)
      .swapExactTokensForTokens(
        swapAmount,
        0,
        path,
        user1.address,
        1000000000000000
      );
    // now the user1 also makes a liquidity addition to trigger the transfer of fee LT from the pool to the collector contract
    const LTAmount1 = utils.parseEther('20');
    await protocolCoin.mint(user1.address, LTAmount1);
    await protocolCoin.connect(user1).approve(router.address, LTAmount1);
    const LTAmount2 = utils.parseEther('20');

    const collectorLTBalanceBefore = await PTWAdaPair.balanceOf(
      collector.address
    );

    await router
      .connect(user1)
      .addLiquidityADA(
        protocolCoin.address,
        LTAmount1,
        0,
        0,
        deployer.address,
        1000000000000000,
        { value: LTAmount2 }
      );

    const collectorLTBalanceAfter = await PTWAdaPair.balanceOf(
      collector.address
    );
    // fee LT should be transferred to the collector contract
    expect(await collectorLTBalanceAfter).to.be.gt(collectorLTBalanceBefore);

    // now we buy back protocol token using the LT of coin1 and coin2 inside the collector
    const stakingContractPTBalanceBefore = await protocolCoin.balanceOf(staking.address);

    await collector.connect(deployer).convert(protocolCoin.address, wADA.address);

    const stakingContractPTBalanceAfter = await protocolCoin.balanceOf(staking.address);

    // staking contract should receive the protocol token
    expect(await stakingContractPTBalanceAfter).to.be.gt(stakingContractPTBalanceBefore);

    // there should be no protocol token in the collector contract
    expect(await protocolCoin.balanceOf(collector.address)).to.be.eq(0);

  });

  it('should collect fee from the token-wADA pair', async () => {
    // make a swap from token to wADA
    const swapAmount = utils.parseEther('10');
    await coin1.mint(user1.address, swapAmount);
    await coin1.connect(user1).approve(router.address, swapAmount);

    const path = [coin1.address, wADA.address];
    await router
      .connect(user1)
      .swapExactTokensForTokens(
        swapAmount,
        0,
        path,
        user1.address,
        1000000000000000
      );
    // now the user1 also makes a liquidity addition to trigger the transfer of fee LT from the pool to the collector contract
    const LTAmount1 = utils.parseEther('20');
    await coin1.mint(user1.address, LTAmount1);
    await coin1.connect(user1).approve(router.address, LTAmount1);
    const LTAmount2 = utils.parseEther('20');

    const collectorLTBalanceBefore = await tokenWAdaPair.balanceOf(
      collector.address
    );

    await router
      .connect(user1)
      .addLiquidityADA(
        coin1.address,
        LTAmount1,
        0,
        0,
        deployer.address,
        1000000000000000,
        { value: LTAmount2 }
      );

    const collectorLTBalanceAfter = await tokenWAdaPair.balanceOf(
      collector.address
    );
    // fee LT should be transferred to the collector contract
    expect(await collectorLTBalanceAfter).to.be.gt(collectorLTBalanceBefore);

    // now we buy back protocol token using the LT of coin1 and coin2 inside the collector
    const stakingContractPTBalanceBefore = await protocolCoin.balanceOf(staking.address);

    await collector.connect(deployer).convert(coin1.address, wADA.address);

    const stakingContractPTBalanceAfter = await protocolCoin.balanceOf(staking.address);

    // staking contract should receive the protocol token
    expect(await stakingContractPTBalanceAfter).to.be.gt(stakingContractPTBalanceBefore);

    // there should be no protocol token in the collector contract
    expect(await protocolCoin.balanceOf(collector.address)).to.be.eq(0);

  });

  it('should collect fee from the token-PT pair', async () => {
    // make a swap from coin1 to coin2
    const swapAmount = utils.parseEther('10');
    await coin2.mint(user1.address, swapAmount);
    await coin2.connect(user1).approve(router.address, swapAmount);

    const path = [coin2.address, protocolCoin.address];

    await router
      .connect(user1)
      .swapExactTokensForTokens(
        swapAmount,
        0,
        path,
        user1.address,
        1000000000000000
      );

    // now the user1 also makes a liquidity addition to trigger the transfer of fee LT from the pool to the collector contract
    const LTAmount1 = utils.parseEther('20');
    await coin2.mint(user1.address, LTAmount1);
    await coin2.connect(user1).approve(router.address, LTAmount1);
    const LTAmount2 = utils.parseEther('20');
    await protocolCoin.mint(user1.address, LTAmount2);
    await protocolCoin.connect(user1).approve(router.address, LTAmount2);

    const collectorLTBalanceBefore = await tokenPTPair.balanceOf(
      collector.address
    );

    await router
      .connect(user1)
      .addLiquidity(
        coin2.address,
        protocolCoin.address,
        LTAmount1,
        LTAmount2,
        0,
        0,
        user1.address,
        1000000000000000
      );

    const collectorLTBalanceAfter = await tokenPTPair.balanceOf(
      collector.address
    );
    // fee LT should be transferred to the collector contract
    expect(await collectorLTBalanceAfter).to.be.gt(collectorLTBalanceBefore);

    // now we buy back protocol token using the LT of coin1 and coin2 inside the collector
    const stakingContractPTBalanceBefore = await protocolCoin.balanceOf(staking.address);

    await collector.connect(deployer).convert(protocolCoin.address, coin2.address);

    const stakingContractPTBalanceAfter = await protocolCoin.balanceOf(staking.address);

    // staking contract should receive the protocol token
    expect(stakingContractPTBalanceAfter).to.be.gt(stakingContractPTBalanceBefore);

    // there should be no protocol token in the collector contract
    expect(await protocolCoin.balanceOf(collector.address)).to.be.eq(0);

  });
});
