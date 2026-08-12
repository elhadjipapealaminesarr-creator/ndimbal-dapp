import { parseAbi } from "viem";

// Sepolia — live DEMO instance: 5-min rounds / 60s lock (comfortable deposit window for the ~70s FHE encryption), batched draw proven to 32 participants
// (top-3 tiered 50/30/20 — see the contract repo's test/capacity-32.test.js). For a live playable draw.
export const POOL = "0x0E53A8A9c149FCFe788776eDF328796285a994F2" as const;
export const TOKEN = "0xe98b1DDd5F51342b3048a3A51A758996bCdCE976" as const;
export const VAULT = "0x4D22EC727D7Ab715531BBEfc55BFEA3BdAF250C7" as const; // confidential yield vault (Sepolia mock of Steakhouse Prime)

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
