import { useState } from "react";
import { useEncrypt } from "@zama-fhe/react-sdk";

// Our deployed NDIMBAL pool on Sepolia (euint128 version).
const POOL = "0x579Dc066A0E51bFe39cc507ebe55851729587f0c" as const;

export function Spike() {
  const encrypt = useEncrypt();
  const [addr, setAddr] = useState<string>();
  const [log, setLog] = useState<string[]>([]);
  const add = (m: string) => setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${m}`]);

  async function connect() {
    const eth = (window as unknown as { ethereum?: any }).ethereum;
    if (!eth) { add("❌ MetaMask not found in this browser."); return; }
    try {
      const accs: string[] = await eth.request({ method: "eth_requestAccounts" });
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] });
      } catch { add("⚠️ Please switch MetaMask to Sepolia manually if it didn't."); }
      setAddr(accs[0]);
      add("✅ Wallet connected: " + accs[0]);
    } catch (e) {
      add("❌ " + (e as Error).message);
    }
  }

  async function test() {
    if (!addr) { add("Connect your wallet first."); return; }
    try {
      add("Encrypting 1000 (euint64) through the relayer…");
      add("   (first time it loads the FHE engine — can take ~10s, be patient)");
      const r: any = await encrypt.mutateAsync({
        values: [{ value: 1000n, type: "euint64" }],
        contractAddress: POOL,
        userAddress: addr as `0x${string}`,
      });
      const handle = r?.handles?.[0] ?? r?.encryptedValues?.[0];
      if (handle) {
        add("✅✅ RELAYER OK — the Sepolia relayer works WITHOUT an API key.");
        add("     GO: we can build the full live dApp.");
      } else {
        add("⚠️ No error, but no handle returned. Result keys: " + Object.keys(r || {}).join(", "));
      }
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      add("❌ " + msg);
      add("   → if it mentions auth / api key / 401 / 403, a relayer API key is required.");
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 700, margin: "40px auto", padding: 20 }}>
      <h1 style={{ marginBottom: 4 }}>NDIMBAL — relayer spike</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        One question: does the Sepolia relayer accept an encryption <b>without an API key</b>?
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {!addr ? (
          <button onClick={connect} style={btn}>Connect MetaMask (Sepolia)</button>
        ) : (
          <>
            <span style={{ fontSize: 13, color: "#333" }}>Connected: {addr}</span>
            <button onClick={test} disabled={encrypt.isPending} style={btn}>
              {encrypt.isPending ? "Encrypting…" : "▶ TEST the relayer (encrypt)"}
            </button>
          </>
        )}
      </div>

      <pre style={{ background: "#0d1b16", color: "#bfe8d4", padding: 14, marginTop: 18, borderRadius: 10, whiteSpace: "pre-wrap", minHeight: 130 }}>
        {log.join("\n") || "Ready. Connect your wallet, then press TEST."}
      </pre>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: "#0E5A4A", color: "#fff", border: 0, borderRadius: 999,
  padding: "10px 18px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};
