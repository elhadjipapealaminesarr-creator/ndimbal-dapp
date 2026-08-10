import { parseAbi } from "viem";

// Sepolia — live DEMO instance: 10-min rounds / 2-min lock, HCU-proven cap of 3 participants
// (draw() reverts at 4 — see the contract repo's test/capacity-32.test.js). For a live playable draw.
export const POOL = "0x0c3f8d846923f814569DF71276110c2Efa5390EF" as const;
export const TOKEN = "0xEAcc7E03F02a90DE0406b8Df8CF3d33D19Cdd5b8" as const;
export const VAULT = "0x1B088Db46abE2993FA16d93195f5d4B54136B1cD" as const; // confidential yield vault (Sepolia mock of Steakhouse Prime)

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
  "function draw()",
  "function drawTickets(uint256 batch)",
  "function drawWinners(uint256 batch)",
  "function drawPhase(uint256) view returns (uint8)",
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

// Confidential yield vault (Sepolia mock of the Steakhouse Confidential Prime USDC vault on Morpho).
export const VAULT_ABI = parseAbi([
  "function accrue(address holder, uint64 yieldAmount)", // MOCK ONLY: simulate the strategy earning yield
]);
