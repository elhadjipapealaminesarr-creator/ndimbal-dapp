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

export const zamaConfig = createConfig({
  chains: [sepolia],
  relayers: { [sepolia.id]: web() },
  ethereum: (window as unknown as { ethereum: any }).ethereum, // signing
  provider: readProvider, // reads: balances, ACL, decryption, receipts
  storage: indexedDBStorage,
});
