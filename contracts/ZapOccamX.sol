// SPDX-License-Identifier: GPLv2

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

pragma solidity 0.6.12; // chose this version to be compatible with the imported interfaces

import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@uniswap/lib/contracts/libraries/Babylonian.sol';
import './interfaces/IPair.sol';
import './interfaces/IRouter02.sol';
import './interfaces/IStaking.sol';
import './interfaces/IWADA.sol';
import './libraries/Math.sol';


/**
 * @title Contract for adding liquidity to Uniswap V2 compatible liquidity pairs by providing just one token as input
 * @author Zwilling for OccamX, forked from Wivern for Beefy.Finance (https://github.com/beefyfinance/beefy-contracts/blob/b4f0ab0394b9316e40596b2d8066ee94398449dd/contracts/BIFI/zaps/BeefyZapUniswapV2.txt)
 */
contract ZapOccamX {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IRouter02 public immutable router;
    address public immutable WADA;
    uint256 public constant minimumAmount = 1000;

    constructor(address _router, address _WADA) public {
        // Safety checks to ensure WADA token address
        IWADA(_WADA).deposit{value: 0}();
        IWADA(_WADA).withdraw(0);

        router = IRouter02(_router);
        WADA = _WADA;
    }

    receive() external payable {
        assert(msg.sender == WADA);
    }

    /** 
     * @notice Zap into pair providing ADA as input
     * @param pairAddr Address of the UniswapV2 like pair to add liquidity to
     * @param tokenAmountOutMin Minimum amount of token to receive in the swap before adding liquidity (basically your slippage tolerance)
     * @param stakingAddr Address of the liquidity mining contract to stake to (zero address if you do not want to stake your liquidity)
     */
    function zapInADA (
        address pairAddr,
        uint256 tokenAmountOutMin,
        address stakingAddr
    ) 
        external payable 
    {
        require(msg.value >= minimumAmount, 'Zap: Insignificant input amount');

        IWADA(WADA).deposit{value: msg.value}();

        _swapAndAddLiquidity(pairAddr, tokenAmountOutMin, WADA);
        _stakeOrReturnLiquidity(pairAddr, stakingAddr);
    }

    /** 
     * @notice Zap into pair providing an ERC20 token as input. ERC20 token withdrawal needs to be approved first.
     * @param pairAddr Address of the UniswapV2 like pair to add liquidity to
     * @param tokenAmountOutMin Minimum amount of token to receive in the swap before adding liquidity (basically your slippage tolerance)
     * @param tokenIn Which token of the pair to provide as input
     * @param tokenInAmount How much of tokenIn to invest into pair liquidity
     * @param stakingAddr Address of the liquidity mining contract to stake to (zero address if you do not want to stake your liquidity)
     */
    function zapIn (
        address pairAddr,
        uint256 tokenAmountOutMin,
        address tokenIn,
        uint256 tokenInAmount,
        address stakingAddr
    ) 
        external
    {
        require(tokenInAmount >= minimumAmount, 'Zap: Insignificant input amount');
        require(IERC20(tokenIn).allowance(msg.sender, address(this)) >= tokenInAmount, 'Zap: Input token is not approved');

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), tokenInAmount);

        _swapAndAddLiquidity(pairAddr, tokenAmountOutMin, tokenIn);
        _stakeOrReturnLiquidity(pairAddr, stakingAddr);
    }

    /** 
     * @dev Implements zap by swapping into secondary token and adding the liquidity to the pair
     * @param pairAddr Address of the UniswapV2 like pair to add liquidity to
     * @param tokenAmountOutMin Minimum amount of token to receive in the swap before adding liquidity (basically your slippage tolerance)
     * @param tokenIn Which token of the pair to provide as input
     */
    function _swapAndAddLiquidity(address pairAddr, uint256 tokenAmountOutMin, address tokenIn) private {
        IPair pair = IPair(pairAddr);

        (uint256 reserveA, uint256 reserveB,) = pair.getReserves();
        require(reserveA > minimumAmount && reserveB > minimumAmount, 'Zap: Liquidity pair reserves too low');

        bool isInputA = pair.token0() == tokenIn;
        require(isInputA || pair.token1() == tokenIn, 'Zap: Input token not present in liquidity pair');

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = isInputA ? pair.token1() : pair.token0();

        uint256 fullInvestment = IERC20(tokenIn).balanceOf(address(this));
        uint256 swapAmountIn;
        if (isInputA) {
            swapAmountIn = _getSwapAmount(fullInvestment, reserveA);
        } else {
            swapAmountIn = _getSwapAmount(fullInvestment, reserveB);
        }

        _approveTokenIfNeeded(path[0], address(router));
        uint256[] memory swapedAmounts = router
            .swapExactTokensForTokens(swapAmountIn, tokenAmountOutMin, path, address(this), block.timestamp);

        // double check returned tokens because this is an external contract call
        // (Maybe not needed because the router is under our control, but someone could potentially sneak in a different pool)
        require(IERC20(tokenIn).balanceOf(address(this)) >= fullInvestment.sub(swapAmountIn), "unexpected input amount after swapping");
        require(IERC20(path[1]).balanceOf(address(this)) >= tokenAmountOutMin, "amount of swapped tokens to low");

        _approveTokenIfNeeded(path[1], address(router));
        (,, uint256 amountLiquidity) = router
            .addLiquidity(path[0], path[1], fullInvestment.sub(swapedAmounts[0]), swapedAmounts[1], 1, 1, address(this), block.timestamp);
        
        // double check returned liquidity tokens because this is an external contract call
        // (Maybe not needed because the router is under our control, but someone could potentially sneak in a different pool)
        require(pair.balanceOf(address(this)) >= amountLiquidity && amountLiquidity > 0, "unexpected amount of liquidity tokens returned");

        address[] memory tokensToReturn = new address[](2);
        tokensToReturn[0] = tokenIn;
        tokensToReturn[1] = path[0];
        _returnAssets(tokensToReturn);
    }

    /** 
     * @dev Implements zap by swapping into secondary token and adding the liquidity to the pair
     * @param pairAddr Address of the UniswapV2 like pair to add liquidity to
     */
    function _stakeOrReturnLiquidity(address pairAddr, address stakingAddr) private {
        if (stakingAddr == address(0)) {
            // user does not want to stake, so return the liquidity tokens
            address[] memory tokensToReturn = new address[](1);
            tokensToReturn[0] = pairAddr;
            _returnAssets(tokensToReturn);
        } else {
            // stake for liquidity mining
            IStaking stake = IStaking(stakingAddr);
            require(address(stake.stakingToken()) == pairAddr, "Zap: staking contract for wrong token");
            uint256 previousStake = stake.stakes(msg.sender);
            IPair pair = IPair(pairAddr);
            uint256 amountLT = pair.balanceOf(address(this));
            if (pair.allowance(address(this), stakingAddr) < amountLT){
                pair.approve(stakingAddr, type(uint).max);
            }
            stake.stake(amountLT);
            stake.transferStake(msg.sender, amountLT);
            // double check after external calls
            require(stake.stakes(msg.sender) == previousStake.add(amountLT), "Zap: sender did not receive proper stake of liquidity tokens");
        }
        // TODO update confluence docs
    }


    /** 
     * @dev Sending contract token balances back to the sender
     * @param tokens List of tokens to be sent back
     */
    function _returnAssets(address[] memory tokens) private {
        uint256 balance;
        for (uint256 i; i < tokens.length; i++) {
            balance = IERC20(tokens[i]).balanceOf(address(this));
            if (balance > 0) {
                if (tokens[i] == WADA) {
                    IWADA(WADA).withdraw(balance);
                    (bool success,) = msg.sender.call{value: balance}(new bytes(0));
                    require(success, 'Zap: ETH transfer failed');
                } else {
                    IERC20(tokens[i]).safeTransfer(msg.sender, balance);
                }
            }
        }
    }

    /**
     * @dev More exact calculation of how much of A to swap to B to get the most liquidity tokens from the pair. The derivation of the formula can be found in docs/zap_swap_amout_formula.md
     * @param investmentA total amount of token A given as zap input
     * @param reserveA Amount of A tokens in the pair liquidity before the swap
     */
    function _getSwapAmount(uint256 investmentA, uint256 reserveA) private pure returns (uint256 swapAmount) {
        uint256 rTerm = reserveA.mul(1997).div(1000);
        uint256 rTermSqt = rTerm.mul(rTerm);
        uint256 additionInSqrt = reserveA.mul(investmentA).mul(4*997).div(1000);
        swapAmount = Babylonian.sqrt(
            rTermSqt.add(additionInSqrt                
            )
        ).sub(
            rTerm
        ).div(2*997).mul(1000);
    }

    /** 
     * @notice Estimates how the investment is split in the swap to yield the maximum amount of liquidity tokens
     * @param pairAddr Address of the UniswapV2 like pair to add liquidity to
     * @param tokenIn Which token of the pair to provide as input
     * @param fullInvestmentIn How much of tokenIn to invest into pair liquidity
     * @return swapAmountIn Amount of input tokens to be swapped
     * @return swapAmountOut Amount of secondary tokens to receive in the swap
     * @return swapTokenOut Secondary token address
     */
    function estimateSwap(address pairAddr, address tokenIn, uint256 fullInvestmentIn) public view returns(uint256 swapAmountIn, uint256 swapAmountOut, address swapTokenOut) {
        IPair pair = IPair(pairAddr);

        bool isInputA = pair.token0() == tokenIn;
        require(isInputA || pair.token1() == tokenIn, 'Zap: Input token not present in liquidity pair');

        (uint256 reserveA, uint256 reserveB,) = pair.getReserves();
        (reserveA, reserveB) = isInputA ? (reserveA, reserveB) : (reserveB, reserveA);
        require(reserveA > fullInvestmentIn, 'Zap: Liquidity pair reserves too low');

        swapAmountIn = _getSwapAmount(fullInvestmentIn, reserveA);
        swapAmountOut = router.getAmountOut(swapAmountIn, reserveA, reserveB);
        swapTokenOut = isInputA ? pair.token1() : pair.token0();
    }

    /**
     * @dev Helper to approve ERC20 token spending if needed
     * @param token The token to approve spending of
     * @param spender Address to permit spending by
     */ 
    function _approveTokenIfNeeded(address token, address spender) private {
        if (IERC20(token).allowance(address(this), spender) == 0) {
            IERC20(token).safeApprove(spender, type(uint256).max);
        }
    }
}
