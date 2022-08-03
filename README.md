# Milkomeda-OCCAMX-sc

![](https://hackmd.io/_uploads/SJc3QSC_K.png)

Contract repository for OccamX.

It uses the Milkomeda C1 and is based on the Uniswap V2 AMM model.

## Installation
```
npm install
```

## Running tests
```
npm run test
```

## Deployment
### DEX
To initially deploy the dex, you need to create the factory and router contracts.

For your own testing, you need to deploy the contract for wrapped HBAR. On Mainnet you can reuse the address of the existing contract.
```
npx hardhat run scripts/deployWHBAR.js --network hedera<Main|Test>net
```

First we deploy the factory and the project token
```
npx hardhat run scripts/deployFactory.js --network hedera<Main|Test>net
npx hardhat run scripts/deployProtocolToken.js --network hedera<Main|Test>net
```
And then the router after adjusting the WHBAR and factory address we just created:
```
npx hardhat run scripts/deployRouter.js --network hedera<Main|Test>net
```

### Pairs
Users are going to create new pairs over the frontend. For testing you can use
```
npx hardhat run scripts/deployPair.js --network hedera<Main|Test>net
```
### Zap contract
First adjust the parameters in `scripts/deployZap.js` as needed.
It takes address of the router, WADA and a pool for testing the ADA zap in.

Make sure you have the environment variables setup as required by the `hardhat.config.ts`. This includes the netwrok RPC to connect to and the private key for the deployer to send transactions from.

```
npx hardhat run scripts/deployZap.js --network milkomeda<Main|Test>net
```
To verify the code on https://explorer-mainnet-cardano-evm.c1.milkomeda.com you use the flattened version created with
```
npx hardhat flatten contracts/ZapOccamX.sol > flattened/ZapOccamXFlat.sol
```
Before pasting it to the form, check the file and ensure that there is only one `SPDX-License-Identifier` specified.

### Liquidity Mining
To deploy a new contract for liquidity mining, you can use
```
npx hardhat run scripts/deployUpgradeabilityStaking.js --network milkomedaMainnet
```
It deploys the staking contract and a proxy for upgrading. All parameters can be adjusted in the beginning of the script.

## Maintenance
### Updating Liquidity Mining Epoch
The liquidity mining uses epochs to define how much rewards are distributed at which time. To add an epoch, you can run
Make sure that the following parameters are adjusted to your needs:
- `stakingAddresses` and `rewards`: Table in `scripts/LMInfo.csv` Just copy the columns `LM address` and `OCX rate per second` from the Google Spreadsheet without the header. The file should then have tabs as seperators.
- `newEpochEndDate`: How long the new epoch should last. The start time is automatically the end of the previous epoch or the current time if there was no epoch defined.
```
npx hardhat run scripts/checkStakingEpochs.js --network milkomedaMainnet
```
