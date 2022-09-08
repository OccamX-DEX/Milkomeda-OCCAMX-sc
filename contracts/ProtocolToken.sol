pragma solidity ^0.6.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Capped.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ProtocolToken is ERC20Capped, ERC20Burnable, Ownable {
    using SafeMath for uint;

    constructor(uint totalSupply, address assetManager, string memory name, string memory symbol) public ERC20(name, symbol) ERC20Capped(totalSupply) {
        _mint(assetManager, totalSupply);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20, ERC20Capped) {
        super._beforeTokenTransfer(from, to, amount);
    }
}
