import { ethers } from 'hardhat';
import chai, { use } from 'chai';
import { solidity } from 'ethereum-waffle';

chai.config.includeStack = true;

import { ZapOccamX } from '../typechain/ZapOccamX';
import { WETH9 } from '../typechain/WETH9';
import { Factory } from '../typechain/Factory';
import { Pair } from '../typechain/Pair';
import { Router02 } from '../typechain/Router02';
import { MockCoin } from '../typechain/MockCoin';
import { StakingImp } from '../typechain/StakingImp';

import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { BigNumber, ContractTransaction, providers, utils } from 'ethers';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { isBytes } from '@ethersproject/bytes';
import { ZlibParams } from 'zlib';

const fs = require('fs');
const hre = require('hardhat');

chai.use(solidity);
const { expect } = chai;



describe('Zap', () => {
	let zap: ZapOccamX;
	let coin1: MockCoin;
	let coin2: MockCoin;
	let coin3: MockCoin;
	let liquidity1: BigNumber;
	let liquidity2: BigNumber;
	let liquidity3: BigNumber;
	let liquidityWAda: BigNumber;
	let factory: Factory;
	let pair12: Pair;
	let pair3Ada: Pair;
	let router: Router02;
	let wADA: WETH9;
	let staking12: StakingImp;
	let staking3Ada: StakingImp;

	let deployer: SignerWithAddress;
	let user1: SignerWithAddress;
	let user2: SignerWithAddress;

	beforeEach(async () => {
		[ deployer, user1, user2 ] = await ethers.getSigners();

		// DEPLOY & SETUP all the stuff we need for testing (tokens, weth, factory, pairs, router)
		const coinFactory = await ethers.getContractFactory('MockCoin', deployer);
		coin1 = (await coinFactory.deploy('One', '1ONE')) as MockCoin;
		liquidity1 = utils.parseEther("1");
		coin2 = (await coinFactory.deploy('Two', '2TWO')) as MockCoin;
		liquidity2 = utils.parseEther("2");
		coin3 = (await coinFactory.deploy('Three', '2THREE')) as MockCoin;
		liquidity3 = utils.parseEther("3");


		// wADA is for wrapped ADA on Milkomeda, so it is the WETH equivalent
		const wAdaFactory = await hre.ethers.getContractFactory("WETH9", deployer);
        wADA = await wAdaFactory.deploy() as WETH9;
		liquidityWAda = utils.parseEther("1");

		const factoryFactory = await hre.ethers.getContractFactory("Factory", deployer);
        factory = await factoryFactory.deploy(deployer.address);
		await factory.deployed();

        const routerFactory = await hre.ethers.getContractFactory("Router02");
        router = await routerFactory.deploy(factory.address, wADA.address);

		// we want to test with one token-token pool and one token-wADA pool
		let pairInterface = JSON.parse(fs.readFileSync('./artifacts/contracts/Pair.sol/Pair.json'))['abi'];
		await factory.createPair(coin1.address, coin2.address);
		const addressPair12 = await factory.getPair(coin1.address, coin2.address);
		pair12 = (new hre.ethers.Contract(addressPair12, pairInterface, deployer)) as Pair;
		await coin1.mint(deployer.address, liquidity1);
		await coin2.mint(deployer.address, liquidity2);
		await coin1.connect(deployer).approve(router.address, liquidity1);
        await coin2.connect(deployer).approve(router.address, liquidity2);
		await router.connect(deployer).addLiquidity(coin1.address, coin2.address, liquidity1, liquidity2, 0, 0, deployer.address, 1000000000000000);

		await factory.createPair(wADA.address, coin3.address);
		const addressPair3Ada = await factory.getPair(wADA.address, coin3.address);
		pair3Ada = (new hre.ethers.Contract(addressPair3Ada, pairInterface, deployer)) as Pair;
		await coin3.mint(deployer.address, liquidity3);
		await coin3.connect(deployer).approve(router.address, liquidity3);
		await router.connect(deployer).addLiquidityADA(coin3.address, liquidity3, 0, 0, deployer.address, 1000000000000000, {value: liquidityWAda});

		const stakingFactory = await hre.ethers.getContractFactory("StakingImp", deployer);
		staking12 = await stakingFactory.deploy() as StakingImp;
		staking12.initialize(wADA.address, pair12.address, 1, 0, 1, deployer.address, false, 0);
		staking3Ada = await stakingFactory.deploy() as StakingImp;
		staking3Ada.initialize(wADA.address, pair3Ada.address, 1, 0, 1, deployer.address, true, 400);

		// SETUP the zap contract we want to test
		const zapFactory = await hre.ethers.getContractFactory('ZapOccamX', deployer);
		zap = (await zapFactory.deploy(router.address, wADA.address)) as ZapOccamX;
	});

	afterEach(async () => {
		// check that that there are no funds left in the contract after zapping
		for (let token of [coin1, coin2, coin3, pair12, pair3Ada]){
			expect(await token.balanceOf(zap.address)).to.eq(0);
		}
		expect(await ethers.provider.getBalance(zap.address)).to.eq(0);
	});

	it('should construct the zap contract', async () => {
		expect(zap.address).to.properAddress;
	});

	it('should zap into token-token pair', async () => {
		const inputAmount = utils.parseEther("0.01");
		const minSwapAmount = utils.parseEther("0.009"); // half the input, times two for pool price, minus some slippage
		await coin1.mint(user1.address, inputAmount);
		await coin1.connect(user1).approve(zap.address, inputAmount);

		await zap.connect(user1).zapIn(pair12.address, minSwapAmount, coin1.address, inputAmount, ethers.constants.AddressZero);
		expect(await pair12.balanceOf(user1.address)).to.be.gt(utils.parseEther("0.007")); // receive some liquidity tokens
	});

	it('should zap into token-token pair with other input', async () => {
		const inputAmount = utils.parseEther("0.01");
		const minSwapAmount = utils.parseEther("0.0023"); // half the input, half for pool price, minus some slippage
		await coin2.mint(user1.address, inputAmount);
		await coin2.connect(user1).approve(zap.address, inputAmount);

		await zap.connect(user1).zapIn(pair12.address, minSwapAmount, coin2.address, inputAmount, ethers.constants.AddressZero);
		expect(await pair12.balanceOf(user1.address)).to.be.gt(utils.parseEther("0.003")); // receive some liquidity tokens
	});

	it('should zap into wADA-token pair with ADA', async () => {
		const inputAmount = utils.parseEther("0.1");
		const minSwapAmount = utils.parseEther("0.13"); // half the input, three times for pool price, minus some slippage

		await zap.connect(user1).zapInADA(pair3Ada.address, minSwapAmount, ethers.constants.AddressZero, {value: inputAmount});
		expect(await pair3Ada.balanceOf(user1.address)).to.be.gt(utils.parseEther("0.08")); // receive some liquidity tokens
	});

	it('should zap into wADA-token pair with token', async () => {
		const inputAmount = utils.parseEther("0.1");
		const minSwapAmount = utils.parseEther("0.015"); // half the input, a third for pool price, minus some slippage
		await coin3.mint(user1.address, inputAmount);
		await coin3.connect(user1).approve(zap.address, inputAmount);

		await zap.connect(user1).zapIn(pair3Ada.address, minSwapAmount, coin3.address, inputAmount, ethers.constants.AddressZero);
		expect(await pair3Ada.balanceOf(user1.address)).to.be.gt(utils.parseEther("0.002")); // receive some liquidity tokens
	});

	it('should fail to zap with too high slippage', async () => {
		const inputAmount = utils.parseEther("0.01");
		const minSwapAmount = utils.parseEther("0.00999"); // half the input, times two for pool price, minus too small slippage
		await coin1.mint(user1.address, inputAmount);
		await coin1.connect(user1).approve(zap.address, inputAmount);

		await expect(zap.connect(user1).zapIn(pair12.address, minSwapAmount, coin1.address, inputAmount, ethers.constants.AddressZero))
			.to.be.revertedWith("VM Exception while processing transaction: reverted with reason string 'DEXRouter: INSUFFICIENT_OUTPUT_AMOUNT'");
	});

	it('should fail to zap with wrong input token', async () => {
		const inputAmount = utils.parseEther("0.01");
		const minSwapAmount = utils.parseEther("0.009"); // half the input, times two for pool price, minus too small slippage
		await coin3.mint(user1.address, inputAmount);
		await coin3.connect(user1).approve(zap.address, inputAmount);

		await expect(zap.connect(user1).zapIn(pair12.address, minSwapAmount, coin3.address, inputAmount, ethers.constants.AddressZero))
			.to.be.revertedWith("VM Exception while processing transaction: reverted with reason string 'Zap: Input token not present in liquidity pair'");
	});

	it('should zap into token-token pair and stake liquidity', async () => {
		const inputAmount = utils.parseEther("0.01");
		const minSwapAmount = utils.parseEther("0.009"); // half the input, times two for pool price, minus some slippage
		await coin1.mint(user1.address, inputAmount);
		await coin1.connect(user1).approve(zap.address, inputAmount);

		await zap.connect(user1).zapIn(pair12.address, minSwapAmount, coin1.address, inputAmount, staking12.address);
		expect(await staking12.stakes(user1.address)).to.be.gt(utils.parseEther("0.007"));
	});

	it('should zap into wADA-token pair with ADA and stake liquidity', async () => {
		const inputAmount = utils.parseEther("0.1");
		const minSwapAmount = utils.parseEther("0.13"); // half the input, three times for pool price, minus some slippage

		await zap.connect(user1).zapInADA(pair3Ada.address, minSwapAmount, staking3Ada.address, {value: inputAmount});
		expect(await staking3Ada.stakes(user1.address)).to.be.gt(utils.parseEther("0.08"));
	});

	it('should fail staking into non staking contract', async () => {
		const inputAmount = utils.parseEther("0.01");
		const minSwapAmount = utils.parseEther("0.001");
		await coin1.mint(user1.address, inputAmount);
		await coin1.connect(user1).approve(zap.address, inputAmount);

		// router is not a staking contract
		await expect(zap.connect(user1).zapIn(pair12.address, minSwapAmount, coin1.address, inputAmount, router.address))
			.to.be.reverted;
	});

	it('should fail staking into staking contract for different token', async () => {
		const inputAmount = utils.parseEther("0.01");
		const minSwapAmount = utils.parseEther("0.001");
		await coin1.mint(user1.address, inputAmount);
		await coin1.connect(user1).approve(zap.address, inputAmount);

		await expect(zap.connect(user1).zapIn(pair12.address, minSwapAmount, coin1.address, inputAmount, staking3Ada.address))
			.to.be.revertedWith("VM Exception while processing transaction: reverted with reason string 'Zap: staking contract for wrong token'");
	});

	it('should estimateSwap correctly', async () => {
		const inputAmount = utils.parseEther("0.01");
		const minSwapAmount = utils.parseEther("0.009"); // half the input, times two for pool price, minus some slippage
		await coin1.mint(user1.address, inputAmount);
		await coin1.connect(user1).approve(zap.address, inputAmount);

		const estimation = await zap.connect(user1).estimateSwap(pair12.address, coin1.address, inputAmount);

		await expect(zap.connect(user1).zapIn(pair12.address, minSwapAmount, coin1.address, inputAmount, ethers.constants.AddressZero))
			.to.emit(pair12, "Swap").withArgs(router.address, estimation["swapAmountIn"], 0, 0, estimation["swapAmountOut"], zap.address);
	});
});
