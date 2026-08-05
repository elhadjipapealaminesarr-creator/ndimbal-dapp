import { createConfig } from "@zama-fhe/sdk/ethers";
import { sepolia, indexedDBStorage } from "@zama-fhe/sdk";
import { web } from "@zama-fhe/sdk/web";
import { JsonRpcProvider } from "ethers";

// Dedicated read RPC (Sepolia). MetaMask stays for SIGNING only.
// This routes on-chain reads — including the ACL lookups the decryption flow
// needs — through a clean node, avoiding MetaMask's malformed-RPC errors.
const readProvider = new JsonRpcProvider(
  "https://ethereum-sepolia-rpc.publicnode.com",
  11155111,
);

// A minimal EIP-1193 stand-in used ONLY when the browser has no injected wallet. It answers the read-only
// init calls the SDK makes (so createConfig succeeds and the WHOLE app renders — "ready to use", not a black
// screen), and fails clearly on any signing request so the user is told to install a wallet. Real reads go
// through `readProvider` below, which needs no wallet at all.
const walletStub = {
  isMetaMask: false,
  request: async (args: { method?: string } = {}) => {
    if (args.method === "eth_chainId") return "0xaa36a7"; // Sepolia
    if (args.method === "eth_accounts") return [];          // no connected accounts yet
    throw new Error("No browser wallet detected — install MetaMask to sign transactions.");
  },
  on: () => walletStub,
  removeListener: () => walletStub,
};

// Return the injected wallet if present, otherwise the stub — never undefined, never throws at module-eval.
function safeEthereum(): any {
  try {
    const injected = typeof window !== "undefined" ? (window as unknown as { ethereum?: any }).ethereum : undefined;
    return injected || walletStub;
  } catch {
    return walletStub;
  }
}

// createConfig is wrapped so that if the FHE SDK can't initialise in this environment (no wallet, no
// cross-origin isolation, blocked IndexedDB, …) the module still loads and App can show a friendly notice
// instead of a black screen. zamaConfig is null only when init genuinely failed.
export let zamaConfig: ReturnType<typeof createConfig> | null = null;
try {
  zamaConfig = createConfig({
    chains: [sepolia],
    relayers: { [sepolia.id]: web() },
    ethereum: safeEthereum(), // signing (undefined until a wallet is present — reads still work)
    provider: readProvider, // reads: balances, ACL, decryption, receipts
    storage: indexedDBStorage,
  });
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[NDIMBAL] Zama SDK failed to initialise in this browser:", e);
  zamaConfig = null;
}
