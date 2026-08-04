import { parseAbi } from "viem";

// Sepolia — DEMO instance (euint128), 180s rounds / 20s lock, for a live playable draw.
// (The 1-day-round "production-config" reference stays at 0x579Dc066…7f0c.)
export const POOL = "0x0814191C0cD9B7151437c515ac3618363D8a248b" as const;
export const TOKEN = "0x7c327605Abb2AE6E1CA24721ff507845AEf30F25" as const;

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
