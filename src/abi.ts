import { parseAbi } from "viem";

// Sepolia — live DEMO instance: 10-min rounds / 2-min lock, HCU-proven cap of 3 participants
// (draw() reverts at 4 — see the contract repo's test/capacity-32.test.js). For a live playable draw.
export const POOL = "0x8d3c8d1e5BB610fAc29dA026dA0759b0d5fB7AEb" as const;
export const TOKEN = "0x6AFA34EC415217216331335755C70728a07D18a4" as const;
export const VAULT = "0x214D33a7dC7E3b8Bf9a76cf6F0CCDA0373A3ae49" as const; // confidential yield vault (Sepolia mock of Steakhouse Prime)

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
  "function fundVault(bytes32 encAmount, bytes proof)",
  "function harvestYield()",
  "function setSponsorship(bytes32 encIndexPlus1, bytes32 encPct, bytes proof)",
  "function drawTickets(uint256 batch)",
  "function drawMax2(uint256 batch)",
  "function drawMax3(uint256 batch)",
  "function drawWinners(uint256 batch)",
  "function drawPhase(uint256) view returns (uint8)",
  "function claim(uint256 r)",
  "function claimReinvest(uint256 r)",
  "function claimSponsored()",
  "function confidentialBalanceOf(address) view returns (bytes32)",
  "function didWin(uint256 r, address a) view returns (bytes32)",
  "function sponsoredWonOf(address a) view returns (bytes32)",
  "function participantCount() view returns (uint256)",
  "function round() view returns (uint256)",
  "function depositsOpen() view returns (bool)",
  "function roundEnd() view returns (uint64)",
]);

// Confidential yield vault (Sepolia mock of the Steakhouse Confidential Prime USDC vault on Morpho).
export const VAULT_ABI = parseAbi([
  "function accrue(address holder, uint64 yieldAmount)", // MOCK ONLY: simulate the strategy earning yield
]);
