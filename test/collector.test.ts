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

describe('Zap', () => {
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

  afterEach(async () => {
    // check that there is no protocol token after buy back from the collector SC
    expect(await protocolCoin.balanceOf(collector.address)).to.eq(0);
  });

  it('should construct the collector contract', async () => {
    expect(collector.address).to.properAddress;
  });

      it('should collect fee from the token-token pair', async () => {
      // make some swap from coin1 to coin2
          await coin1.mint()
    const inputAmount = utils.parseEther('0.01');
    const minSwapAmount = utils.parseEther('0.009'); // half the input, times two for pool price, minus some slippage
    await coin1.mint(user1.address, inputAmount);
    await coin1.connect(user1).approve(zap.address, inputAmount);

    await zap
      .connect(user1)
      .zapIn(
        pair12.address,
        minSwapAmount,
        coin1.address,
        inputAmount,
        ethers.constants.AddressZero
      );
    expect(await pair12.balanceOf(user1.address)).to.be.gt(
      utils.parseEther('0.007')
    ); // receive some liquidity tokens
  });

  it('should zap into token-token pair with other input', async () => {
    const inputAmount = utils.parseEther('0.01');
    const minSwapAmount = utils.parseEther('0.0023'); // half the input, half for pool price, minus some slippage
    await coin2.mint(user1.address, inputAmount);
    await coin2.connect(user1).approve(zap.address, inputAmount);

    await zap
      .connect(user1)
      .zapIn(
        pair12.address,
        minSwapAmount,
        coin2.address,
        inputAmount,
        ethers.constants.AddressZero
      );
    expect(await pair12.balanceOf(user1.address)).to.be.gt(
      utils.parseEther('0.003')
    ); // receive some liquidity tokens
  });

  it('should zap into wADA-token pair with ADA', async () => {
    const inputAmount = utils.parseEther('0.1');
    const minSwapAmount = utils.parseEther('0.13'); // half the input, three times for pool price, minus some slippage

    await zap
      .connect(user1)
      .zapInADA(pair3Ada.address, minSwapAmount, ethers.constants.AddressZero, {
        value: inputAmount,
      });
    expect(await pair3Ada.balanceOf(user1.address)).to.be.gt(
      utils.parseEther('0.08')
    ); // receive some liquidity tokens
  });

  it('should zap into wADA-token pair with token', async () => {
    const inputAmount = utils.parseEther('0.1');
    const minSwapAmount = utils.parseEther('0.015'); // half the input, a third for pool price, minus some slippage
    await coin3.mint(user1.address, inputAmount);
    await coin3.connect(user1).approve(zap.address, inputAmount);

    await zap
      .connect(user1)
      .zapIn(
        pair3Ada.address,
        minSwapAmount,
        coin3.address,
        inputAmount,
        ethers.constants.AddressZero
      );
    expect(await pair3Ada.balanceOf(user1.address)).to.be.gt(
      utils.parseEther('0.002')
    ); // receive some liquidity tokens
  });

  it('should fail to zap with too high slippage', async () => {
    const inputAmount = utils.parseEther('0.01');
    const minSwapAmount = utils.parseEther('0.00999'); // half the input, times two for pool price, minus too small slippage
    await coin1.mint(user1.address, inputAmount);
    await coin1.connect(user1).approve(zap.address, inputAmount);

    await expect(
      zap
        .connect(user1)
        .zapIn(
          pair12.address,
          minSwapAmount,
          coin1.address,
          inputAmount,
          ethers.constants.AddressZero
        )
    ).to.be.revertedWith(
      "VM Exception while processing transaction: reverted with reason string 'DEXRouter: INSUFFICIENT_OUTPUT_AMOUNT'"
    );
  });

  it('should fail to zap with wrong input token', async () => {
    const inputAmount = utils.parseEther('0.01');
    const minSwapAmount = utils.parseEther('0.009'); // half the input, times two for pool price, minus too small slippage
    await coin3.mint(user1.address, inputAmount);
    await coin3.connect(user1).approve(zap.address, inputAmount);

    await expect(
      zap
        .connect(user1)
        .zapIn(
          pair12.address,
          minSwapAmount,
          coin3.address,
          inputAmount,
          ethers.constants.AddressZero
        )
    ).to.be.revertedWith(
      "VM Exception while processing transaction: reverted with reason string 'Zap: Input token not present in liquidity pair'"
    );
  });

  it('should zap into token-token pair and stake liquidity', async () => {
    const inputAmount = utils.parseEther('0.01');
    const minSwapAmount = utils.parseEther('0.009'); // half the input, times two for pool price, minus some slippage
    await coin1.mint(user1.address, inputAmount);
    await coin1.connect(user1).approve(zap.address, inputAmount);

    await zap
      .connect(user1)
      .zapIn(
        pair12.address,
        minSwapAmount,
        coin1.address,
        inputAmount,
        staking12.address
      );
    expect(await staking12.stakes(user1.address)).to.be.gt(
      utils.parseEther('0.007')
    );
  });

  it('should zap into wADA-token pair with ADA and stake liquidity', async () => {
    const inputAmount = utils.parseEther('0.1');
    const minSwapAmount = utils.parseEther('0.13'); // half the input, three times for pool price, minus some slippage

    await zap
      .connect(user1)
      .zapInADA(pair3Ada.address, minSwapAmount, staking3Ada.address, {
        value: inputAmount,
      });
    expect(await staking3Ada.stakes(user1.address)).to.be.gt(
      utils.parseEther('0.08')
    );
  });

  it('should fail staking into non staking contract', async () => {
    const inputAmount = utils.parseEther('0.01');
    const minSwapAmount = utils.parseEther('0.001');
    await coin1.mint(user1.address, inputAmount);
    await coin1.connect(user1).approve(zap.address, inputAmount);

    // router is not a staking contract
    await expect(
      zap
        .connect(user1)
        .zapIn(
          pair12.address,
          minSwapAmount,
          coin1.address,
          inputAmount,
          router.address
        )
    ).to.be.reverted;
  });

  it('should fail staking into staking contract for different token', async () => {
    const inputAmount = utils.parseEther('0.01');
    const minSwapAmount = utils.parseEther('0.001');
    await coin1.mint(user1.address, inputAmount);
    await coin1.connect(user1).approve(zap.address, inputAmount);

    await expect(
      zap
        .connect(user1)
        .zapIn(
          pair12.address,
          minSwapAmount,
          coin1.address,
          inputAmount,
          staking3Ada.address
        )
    ).to.be.revertedWith(
      "VM Exception while processing transaction: reverted with reason string 'Zap: staking contract for wrong token'"
    );
  });

  it('should estimateSwap correctly', async () => {
    const inputAmount = utils.parseEther('0.01');
    const minSwapAmount = utils.parseEther('0.009'); // half the input, times two for pool price, minus some slippage
    await coin1.mint(user1.address, inputAmount);
    await coin1.connect(user1).approve(zap.address, inputAmount);

    const estimation = await zap
      .connect(user1)
      .estimateSwap(pair12.address, coin1.address, inputAmount);

    await expect(
      zap
        .connect(user1)
        .zapIn(
          pair12.address,
          minSwapAmount,
          coin1.address,
          inputAmount,
          ethers.constants.AddressZero
        )
    )
      .to.emit(pair12, 'Swap')
      .withArgs(
        router.address,
        estimation['swapAmountIn'],
        0,
        0,
        estimation['swapAmountOut'],
        zap.address
      );
  });

  it('should fail to estimateSwap on low liquidity', async () => {
    const coinFactory = await ethers.getContractFactory('MockCoin', deployer);
    const coin4 = (await coinFactory.deploy('Four', '4')) as MockCoin;
    const lowLiquidityA = utils.parseEther('0.000001');
    const lowLiquidityB = utils.parseEther('0.00000000099');
    await coin1.mint(deployer.address, lowLiquidityA);
    await coin4.mint(deployer.address, lowLiquidityB);
    await coin1.connect(deployer).approve(router.address, lowLiquidityA);
    await coin4.connect(deployer).approve(router.address, lowLiquidityB);
    await router
      .connect(deployer)
      .addLiquidity(
        coin1.address,
        coin4.address,
        lowLiquidityA,
        lowLiquidityB,
        0,
        0,
        deployer.address,
        1000000000000000
      );
    const addressPair14 = await factory.getPair(coin1.address, coin4.address);

    const inputAmount = utils.parseEther('0.0001');
    await coin1.mint(user1.address, inputAmount);
    await coin1.connect(user1).approve(zap.address, inputAmount);

    await expect(
      zap.connect(user1).estimateSwap(addressPair14, coin1.address, inputAmount)
    ).to.be.revertedWith('Zap: Liquidity pair reserves too low');
  });
});
