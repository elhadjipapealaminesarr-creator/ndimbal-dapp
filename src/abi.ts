import { parseAbi } from "viem";

// Sepolia — live DEMO instance: 10-min rounds / 2-min lock, HCU-proven cap of 3 participants
// (draw() reverts at 4 — see the contract repo's test/capacity-32.test.js). For a live playable draw.
export const POOL = "0x18ab12b1F33DA1E94eA6a50A561E73924A3d4DEa" as const;
export const TOKEN = "0x4bef3d11E6C62da8c51EC4815FCD617A02FC1501" as const;

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
