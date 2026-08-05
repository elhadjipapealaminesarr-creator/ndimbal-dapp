import { Component, useEffect, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { zamaConfig } from "./config";
import { NdimbalDapp } from "./NdimbalDapp";

const queryClient = new QueryClient();

// Animated "blockchain field" behind the app: drifting nodes joined by fading links, in the brand's
// green/gold, on the deep background set in index.css. The app renders as a warm centered column on top,
// so this network shows in the side margins — turning dead space into a live, on-theme backdrop.
function NetworkBg() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0, nodes: { x: number; y: number; vx: number; vy: number }[] = [], raf = 0;

    const resize = () => {
      w = canvas.width = window.innerWidth * DPR;
      h = canvas.height = window.innerHeight * DPR;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
    };
    const init = () => {
      const count = Math.max(28, Math.min(80, Math.floor(window.innerWidth / 26)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22 * DPR, vy: (Math.random() - 0.5) * 0.22 * DPR,
      }));
    };
    const LINK = 150 * DPR;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        a.x += a.vx; a.y += a.vy;
        if (a.x < 0 || a.x > w) a.vx *= -1;
        if (a.y < 0 || a.y > h) a.vy *= -1;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < LINK) {
            ctx.strokeStyle = `rgba(37,225,160,${(1 - d / LINK) * 0.16})`;
            ctx.lineWidth = 1 * DPR;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const a of nodes) {
        ctx.fillStyle = "rgba(228,162,76,0.6)";
        ctx.beginPath(); ctx.arc(a.x, a.y, 1.6 * DPR, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    resize(); init();
    if (reduce) { draw(); cancelAnimationFrame(raf); } // one static frame if the user prefers no motion
    else draw();
    const onResize = () => { resize(); init(); };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, []);
  return <canvas ref={ref} aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}

// Full-page fallback shown instead of a blank/black screen when the app can't run in this browser.
function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#eafff6", fontFamily: "Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif", padding: 24, textAlign: "center" }}>
      <div style={{ maxWidth: 540, background: "rgba(9,20,16,.66)", backdropFilter: "blur(8px)", border: "1px solid rgba(55,225,160,.2)", borderRadius: 24, padding: "36px 28px" }}>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: ".05em" }}>
          <span style={{ color: "#37E1A0" }}>NDIM</span><span style={{ color: "#E4A24C" }}>BAL</span>
        </div>
        <h1 style={{ fontSize: 22, margin: "16px 0 8px", letterSpacing: "-.01em", color: "#fff" }}>{title}</h1>
        <p style={{ color: "#a9c5ba", lineHeight: 1.6, margin: 0 }}>{body}</p>
        <a href="https://metamask.io/download/" target="_blank" rel="noopener" style={{ display: "inline-block", marginTop: 18, background: "#37E1A0", color: "#052018", fontWeight: 800, padding: "12px 22px", borderRadius: 999, textDecoration: "none" }}>Get a Web3 wallet (MetaMask)</a>
        <p style={{ color: "#6f8a7f", fontSize: 13, marginTop: 14 }}>Then reload this page. Best viewed in Chrome, Brave, Edge or Firefox on desktop.</p>
      </div>
    </div>
  );
}

const NOTICE = {
  title: "Open NDIMBAL in a Web3 browser",
  body: "NDIMBAL runs live on the Sepolia testnet and needs a browser wallet like MetaMask to sign transactions. Install one (or open this page in a browser that has it enabled) to play a full confidential round.",
};

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
  return (
    <>
      <NetworkBg />
      {!zamaConfig ? (
        <Notice title={NOTICE.title} body={NOTICE.body} />
      ) : (
        <Boundary>
          <QueryClientProvider client={queryClient}>
            <ZamaProvider config={zamaConfig}>
              <NdimbalDapp />
            </ZamaProvider>
          </QueryClientProvider>
        </Boundary>
      )}
    </>
  );
}
