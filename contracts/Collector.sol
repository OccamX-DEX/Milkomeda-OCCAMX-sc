// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "./libraries/SafeMath.sol";
import "./libraries/SafeERC20.sol";

import "./interfaces/IERC20.sol";
import "./interfaces/IPair.sol";
import "./interfaces/IFactory.sol";

import "./Ownable.sol";

contract Collector is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;


    IFactory public immutable factory;
    address public PToken;
    address public immutable wada;
    address public stakingContract;
    bool public locked; //lock liquidity inside the collector until the staking contract is deployed

    mapping(address => address) internal _bridges;

    event LogBridgeSet(address indexed token, address indexed bridge);
    event LogConvert(
        address indexed server,
        address indexed token0,
        address indexed token1,
        uint256 amount0,
        uint256 amount1,
        uint256 amountPToken
    );

    constructor(
        address _factory,
        address _PToken,
        address _wada
    ) public {
        factory = IFactory(_factory);
        PToken = _PToken;
        wada = _wada;
        locked = true;
    }

    function bridgeFor(address token) public view returns (address bridge) {
        bridge = _bridges[token];
        if (bridge == address(0)) {
            bridge = wada;
        }
    }

    function setBridge(address token, address bridge) external onlyOwner {
        // Checks
        require(
            token != PToken && token != wada && token != bridge,
            "Collector: Invalid bridge"
        );

        // Effects
        _bridges[token] = bridge;
        emit LogBridgeSet(token, bridge);
    }

    function setStakingContract(address _stakingContract) external onlyOwner {
        stakingContract = _stakingContract;
    }

    function setPToken(address _PToken) external onlyOwner {
        PToken = _PToken;
    }

    modifier onlyEOA() {
        // Try to make flash-loan exploit harder to do by only allowing externally owned addresses.
        require(msg.sender == tx.origin, "Collector: must use EOA");
        _;
    }

    modifier onlyWhenUnlocked() {
        require(locked == false, "Collector: liquidity is locked");
        _;
    }

    function setLock(bool _locked) external onlyOwner {
        locked = _locked;
    }

    function convert(address token0, address token1) external onlyEOA() onlyWhenUnlocked() onlyOwner {
        _convert(token0, token1);
    }

    function convertMultiple(
        address[] calldata token0,
        address[] calldata token1
    ) external onlyEOA() onlyWhenUnlocked() onlyOwner {
        require(token0.length == token1.length, "the length of the array is invalid");
        uint256 len = token0.length;
        for (uint256 i = 0; i < len; i++) {
            _convert(token0[i], token1[i]);
        }
    }

    function _convert(address token0, address token1) internal {
        IPair pair = IPair(factory.getPair(token0, token1));
        require(address(pair) != address(0), "Collector: Invalid pair");

        IERC20(address(pair)).safeTransfer(
            address(pair),
            pair.balanceOf(address(this))
        );

        (uint256 amount0, uint256 amount1) = pair.burn(address(this));
        if (token0 != pair.token0()) {
            (amount0, amount1) = (amount1, amount0);
        }
        emit LogConvert(
            msg.sender,
            token0,
            token1,
            amount0,
            amount1,
            _convertStep(token0, token1, amount0, amount1)
        );
    }

    function _convertStep(
        address token0,
        address token1,
        uint256 amount0,
        uint256 amount1
    ) internal returns (uint256 PTokenOut) {
        // Interactions
        if (token0 == token1) {
            uint256 amount = amount0.add(amount1);
            if (token0 == PToken) {
                IERC20(PToken).safeTransfer(stakingContract, amount);
                PTokenOut = amount;
            } else if (token0 == wada) {
                PTokenOut = _toPToken(wada, amount);
            } else {
                address bridge = bridgeFor(token0);
                amount = _swap(token0, bridge, amount, address(this));
                PTokenOut = _convertStep(bridge, bridge, amount, 0);
            }
        } else if (token0 == PToken) {
            IERC20(PToken).safeTransfer(stakingContract, amount0);
            PTokenOut = _toPToken(token1, amount1).add(amount0);
        } else if (token1 == PToken) {
            IERC20(PToken).safeTransfer(stakingContract, amount1);
            PTokenOut = _toPToken(token0, amount0).add(amount1);
        } else if (token0 == wada) {
            // eg. ADA - USDC
            PTokenOut = _toPToken(
                wada,
                _swap(token1, wada, amount1, address(this)).add(amount0)
            );
        } else if (token1 == wada) {
            // eg. USDT - ADA
            PTokenOut = _toPToken(
                wada,
                _swap(token0, wada, amount0, address(this)).add(amount1)
            );
        } else {
            // eg. MIC - USDT
            address bridge0 = bridgeFor(token0);
            address bridge1 = bridgeFor(token1);
            if (bridge0 == token1) {
                // eg. MIC - USDT - and bridgeFor(MIC) = USDT
                PTokenOut = _convertStep(
                    bridge0,
                    token1,
                    _swap(token0, bridge0, amount0, address(this)),
                    amount1
                );
            } else if (bridge1 == token0) {
                // eg. WBTC - DSD - and bridgeFor(DSD) = WBTC
                PTokenOut = _convertStep(
                    token0,
                    bridge1,
                    amount0,
                    _swap(token1, bridge1, amount1, address(this))
                );
            } else {
                PTokenOut = _convertStep(
                    bridge0,
                    bridge1, // eg. USDT - DSD - and bridgeFor(DSD) = WBTC
                    _swap(token0, bridge0, amount0, address(this)),
                    _swap(token1, bridge1, amount1, address(this))
                );
            }
        }
    }

    function _swap(
        address fromToken,
        address toToken,
        uint256 amountIn,
        address to
    ) internal returns (uint256 amountOut) {

        IPair pair = IPair(factory.getPair(fromToken, toToken));
        require(address(pair) != address(0), "Collector: Cannot convert");

        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        uint256 amountInWithFee = amountIn.mul(997);
        if (fromToken == pair.token0()) {
            amountOut =
                amountInWithFee.mul(reserve1) /
                reserve0.mul(1000).add(amountInWithFee);
            IERC20(fromToken).safeTransfer(address(pair), amountIn);
            pair.swap(0, amountOut, to, new bytes(0));
            // TODO: Add maximum slippage?
        } else {
            amountOut =
                amountInWithFee.mul(reserve0) /
                reserve1.mul(1000).add(amountInWithFee);
            IERC20(fromToken).safeTransfer(address(pair), amountIn);
            pair.swap(amountOut, 0, to, new bytes(0));
            // TODO: Add maximum slippage?
        }
    }

    function _toPToken(address token, uint256 amountIn)
        internal
        returns (uint256 amountOut)
    {
        amountOut = _swap(token, PToken, amountIn, stakingContract);
    }
}

