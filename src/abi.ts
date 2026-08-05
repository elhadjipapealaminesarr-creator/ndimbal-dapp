import { parseAbi } from "viem";

// Sepolia — live DEMO instance: 10-min rounds / 2-min lock, HCU-proven cap of 3 participants
// (draw() reverts at 4 — see the contract repo's test/capacity-32.test.js). For a live playable draw.
export const POOL = "0xf507fAe5cF86C17A085E84C21ba15a42776d5103" as const;
export const TOKEN = "0xbE4d632D7378AC0821213e3e01ab2c07f5554E23" as const;

// Encrypted params are bytes32 handles + a bytes proof in the ABI.
export const TOKEN_ABI = parseAbi([
  "function mint(address to, bytes32 amount, bytes proof)",
  "function setOperator(address operator, uint48 until)",
  "function confidentialBalanceOf(address) view returns (bytes32)",
]);

export const POOL_ABI = parseAbi([
  "function deposit(bytes32 encAmount, bytes proof)",
  "function withdraw(bytes32 encAmount, bytes proof)",
  "function setGiveBack(bytes32 encPct, bytes proof)",
  "function fundPrize(bytes32 encAmount, bytes proof)",
  "function setSponsorship(bytes32 encIndexPlus1, bytes32 encPct, bytes proof)",
  "function draw()",
  "function claim(uint256 r)",
  "function claimSponsored()",
  "function confidentialBalanceOf(address) view returns (bytes32)",
  "function didWin(uint256 r, address a) view returns (bytes32)",
  "function sponsoredWonOf(address a) view returns (bytes32)",
  "function participantCount() view returns (uint256)",
  "function round() view returns (uint256)",
  "function depositsOpen() view returns (bool)",
  "function roundEnd() view returns (uint64)",
]);
