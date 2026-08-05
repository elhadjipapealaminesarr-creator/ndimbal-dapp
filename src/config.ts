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

// Read the injected wallet defensively — on a browser without MetaMask this is simply undefined,
// and must never throw at module-eval time (a throw here would blank the whole page before React mounts).
function safeEthereum(): any {
  try {
    return typeof window !== "undefined" ? (window as unknown as { ethereum?: any }).ethereum : undefined;
  } catch {
    return undefined;
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
