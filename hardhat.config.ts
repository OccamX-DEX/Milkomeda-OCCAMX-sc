// loading variables from .env
require('dotenv').config();

import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan"; 
import "@nomiclabs/hardhat-ethers";
import "hardhat-contract-sizer";
import "@typechain/hardhat";


const { utils } = require("ethers");
/* const { sleep } = require("./scripts/helpers"); */

module.exports = {
  solidity: {
    compilers: [
        {
            version: "0.4.18",
        },
        {
            version: "0.5.16",
        },
        {
            version: "0.6.6",
        },
        {
            version: "0.6.12",
        },
        {
            version: "0.7.6",
        },
        ],   
    },
    networks: {
        hardhat: {
            allowUnlimitedContractSize: true, // is that option ok for testing? Could not deploy Router02. It is deployed on Milkomeda though
        },
        milkomedaTestnet: {
            url: process.env.MilkomedaTestnetAPI,
            accounts: [ process.env.MilkomedaTestnetDeployerPrivateKey,
                        process.env.MilkomedaTestnetUser1PrivateKey,
                        process.env.MilkomedaTestnetUser2PrivateKey ],
        },
        milkomedaMainnet: {
            url: process.env.MilkomedaMainnetAPI,
            accounts: [ process.env.MilkomedaMainnetDeployerPrivateKey ],
        },
        algoMilkomedaTestnet: {
            url: "https://rpc-devnet-algorand-rollup.a1.milkomeda.com",
            accounts: [ process.env.MilkomedaA1TestnetDeployerPrivateKey ],
        },
    }
};


