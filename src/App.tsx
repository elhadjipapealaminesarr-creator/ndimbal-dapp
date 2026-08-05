import { Component, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { zamaConfig } from "./config";
import { NdimbalDapp } from "./NdimbalDapp";

const queryClient = new QueryClient();

// Full-page fallback shown instead of a blank/black screen when the app can't run in this browser
// (no wallet, no cross-origin isolation, blocked storage, or any render crash inside the SDK provider).
function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(1200px 700px at 80% -10%,#f3ede0 0,#FBF7F0 55%)", color: "#17233A", fontFamily: "Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif", padding: 24, textAlign: "center" }}>
      <div style={{ maxWidth: 540 }}>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: ".05em" }}>
          <span style={{ color: "#0E5A4A" }}>NDIM</span><span style={{ color: "#B87A28" }}>BAL</span>
        </div>
        <h1 style={{ fontSize: 22, margin: "16px 0 8px", letterSpacing: "-.01em" }}>{title}</h1>
        <p style={{ color: "#6E7688", lineHeight: 1.6, margin: 0 }}>{body}</p>
        <a href="https://metamask.io/download/" target="_blank" rel="noopener" style={{ display: "inline-block", marginTop: 18, background: "#0E5A4A", color: "#fff", fontWeight: 700, padding: "12px 22px", borderRadius: 999, textDecoration: "none" }}>Get a Web3 wallet (MetaMask)</a>
        <p style={{ color: "#9aa2b1", fontSize: 13, marginTop: 14 }}>Then reload this page. Best viewed in Chrome, Brave, Edge or Firefox on desktop.</p>
      </div>
    </div>
  );
}

const NOTICE = {
  title: "Open NDIMBAL in a Web3 browser",
  body: "NDIMBAL runs live on the Sepolia testnet and needs a browser wallet like MetaMask to sign transactions. Install one (or open this page in a browser that has it enabled) to play a full confidential round.",
};

// Catches any render-time crash inside the SDK provider so the page shows the notice, never a black screen.
class Boundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { /* eslint-disable-next-line no-console */ console.error("[NDIMBAL] render error:", err); }
  render() {
    if (this.state.err) return <Notice title={NOTICE.title} body={NOTICE.body} />;
    return this.props.children;
  }
}

export default function App() {
  // If the SDK could not initialise at all (module-eval), show the notice instead of a blank page.
  if (!zamaConfig) return <Notice title={NOTICE.title} body={NOTICE.body} />;

  return (
    <Boundary>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider config={zamaConfig}>
          <NdimbalDapp />
        </ZamaProvider>
      </QueryClientProvider>
    </Boundary>
  );
}
