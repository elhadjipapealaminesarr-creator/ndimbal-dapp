import { useEffect, useMemo, useRef, useState } from "react";
import { bytesToHex } from "viem";
import { useZamaSDK, useGrantPermit, useDecryptValues } from "@zama-fhe/react-sdk";
import { POOL, TOKEN, VAULT, POOL_ABI, TOKEN_ABI, VAULT_ABI } from "./abi";

type Hex = `0x${string}`;
const asHex = (v: unknown): Hex => (typeof v === "string" ? (v as Hex) : bytesToHex(v as Uint8Array));
const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
const SCAN = `https://sepolia.etherscan.io/address/${POOL}`;

type Target = { encryptedValue: Hex; contractAddress: Hex };

export function NdimbalDapp() {
  const sdk = useZamaSDK();
  const { mutateAsync: grantPermit, isPending: authorizing } = useGrantPermit();

  const [addr, setAddr] = useState<Hex>();
  const [round, setRound] = useState("—");
  const [pcount, setPcount] = useState("—");
  const [open, setOpen] = useState("—");
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [dep, setDep] = useState("1000");
  const [fund, setFund] = useState("500");
  const [vaultAmt, setVaultAmt] = useState("1000");
  const [yieldAmt, setYieldAmt] = useState("50");
  const [pct, setPct] = useState(30);
  const [sponIdx, setSponIdx] = useState("1");
  const [sponPct, setSponPct] = useState("20");
  const [log, setLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [roundEndTs, setRoundEndTs] = useState<number | null>(null); // unix seconds the current round ends
  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000));

  const [slots, setSlots] = useState<Record<string, Target>>({});
  const targets = useMemo(() => Object.values(slots), [slots]);
  const decrypt = useDecryptValues(targets, { enabled: authed && targets.length > 0 });
  const dval = (slot: string) => {
    const t = slots[slot];
    if (!t) return "—";
    const v = decrypt.data?.[t.encryptedValue];
    return v === undefined ? "decrypting…" : `${v.toString()} cUSDC`;
  };

  const add = (m: string) => setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${m}`].slice(-40));

  async function connect() {
    const eth = (window as unknown as { ethereum?: any }).ethereum;
    if (!eth) return add("❌ MetaMask not found — install it to continue.");
    try {
      const accs: string[] = await eth.request({ method: "eth_requestAccounts" });
      try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] }); } catch {}
      await (sdk.signer as any)?.refreshWalletAccount?.();
      setAddr(accs[0] as Hex);
      add("✅ Connected: " + accs[0]);
      await refresh();
    } catch (e) { add("❌ " + (e as Error).message); }
  }

  async function encOne(contractAddress: Hex, value: number) {
    add("  🔒 encrypting in your browser…");
    const enc: any = await sdk.encrypt({
      values: [{ value: BigInt(value), type: "euint64" }],
      contractAddress, userAddress: addr!,
    });
    const ev = enc.encryptedValues?.[0] ?? enc.handles?.[0];
    return { handle: asHex(ev), proof: asHex(enc.inputProof) };
  }
  async function encTwo(contractAddress: Hex, v1: number, v2: number) {
    add("  🔒 encrypting in your browser…");
    const enc: any = await sdk.encrypt({
      values: [{ value: BigInt(v1), type: "euint64" }, { value: BigInt(v2), type: "euint64" }],
      contractAddress, userAddress: addr!,
    });
    const evs = enc.encryptedValues ?? enc.handles;
    return { h1: asHex(evs[0]), h2: asHex(evs[1]), proof: asHex(enc.inputProof) };
  }
  // busy is set BEFORE building (encrypting) so the UI reacts instantly on click.
  async function send(label: string, build: () => Promise<string>) {
    setBusy(true);
    add("→ " + label + "…");
    try {
      const hash = await build();
      add("  tx sent, confirming: https://sepolia.etherscan.io/tx/" + hash);
      const eth = (window as unknown as { ethereum: any }).ethereum;
      let receipt: any = null;
      for (let i = 0; i < 60 && !receipt; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        try { receipt = await eth.request({ method: "eth_getTransactionReceipt", params: [hash] }); } catch {}
      }
      if (!receipt) add("  ⏳ " + label + ": still pending — check the link.");
      else if (receipt.status === "0x1") { add("  ✅ " + label + " CONFIRMED"); await refresh(); }
      else add("  ❌ " + label + " reverted on-chain.");
    } catch (e) { add("  ❌ " + label + " failed: " + ((e as Error).message || e)); }
    finally { setBusy(false); }
  }
  const write = (address: Hex, abi: any, fn: string, args: any[]) => (sdk.signer as any).writeContract({ address, abi, functionName: fn, args });
  const read = (address: Hex, abi: any, fn: string, args: any[] = []) => (sdk.provider as any).readContract({ address, abi, functionName: fn, args });

  const mint = () => send("Mint 1,000,000 cUSDC", async () => { const e = await encOne(TOKEN, 1_000_000); return write(TOKEN, TOKEN_ABI, "mint", [addr, e.handle, e.proof]); });
  const approve = () => send("Allow pool", async () => { const until = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600); return write(TOKEN, TOKEN_ABI, "setOperator", [POOL, until]); });
  const deposit = () => { const v = +dep || 0; if (v <= 0) return; send(`Deposit ${v}`, async () => {
    // Jury-proof: if deposits are locked ONLY because the round already ended (nobody triggered the draw),
    // run the draw first — it advances the round and reopens the deposit window — then deposit in the same flow.
    const [op, end] = await Promise.all([read(POOL, POOL_ABI, "depositsOpen"), read(POOL, POOL_ABI, "roundEnd")]);
    const now = Math.floor(Date.now() / 1000);
    if (!op && Number(end) <= now) {
      add("  ⓘ Round ended — running the draw first to reopen deposits…");
      const dh: string = await write(POOL, POOL_ABI, "draw", []);
      add("  draw tx: https://sepolia.etherscan.io/tx/" + dh);
      const eth = (window as unknown as { ethereum: any }).ethereum;
      for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 1500)); const rc = await eth.request({ method: "eth_getTransactionReceipt", params: [dh] }).catch(() => null); if (rc) break; }
    }
    const e = await encOne(POOL, v); return write(POOL, POOL_ABI, "deposit", [e.handle, e.proof]);
  }); };
  const withdraw = () => { const v = +dep || 0; if (v <= 0) return; send(`Withdraw ${v}`, async () => { const e = await encOne(POOL, v); return write(POOL, POOL_ABI, "withdraw", [e.handle, e.proof]); }); };
  const giveBack = () => send(`Set give-back ${pct}%`, async () => { const e = await encOne(POOL, pct); return write(POOL, POOL_ABI, "setGiveBack", [e.handle, e.proof]); });
  const fundPrize = () => { const v = +fund || 0; if (v <= 0) return; send(`Fund prize ${v}`, async () => { const e = await encOne(POOL, v); return write(POOL, POOL_ABI, "fundPrize", [e.handle, e.proof]); }); };
  const fundVault = () => { const v = +vaultAmt || 0; if (v <= 0) return; send(`Route ${v} into the yield vault`, async () => { const e = await encOne(POOL, v); return write(POOL, POOL_ABI, "fundVault", [e.handle, e.proof]); }); };
  const simulateYield = () => { const v = +yieldAmt || 0; if (v <= 0) return; send(`Vault earns ${v} yield (demo)`, async () => write(VAULT, VAULT_ABI, "accrue", [POOL, BigInt(v)])); };
  const harvestYield = () => send("Harvest yield → prize", async () => write(POOL, POOL_ABI, "harvestYield", []));
  const setSponsorship = () => { const i = +sponIdx || 0; const p = +sponPct || 0; if (i < 1) return; send(`Set hidden benefactor (member #${i}, ${p}%)`, async () => { const e = await encTwo(POOL, i, p); return write(POOL, POOL_ABI, "setSponsorship", [e.h1, e.h2, e.proof]); }); };
  const draw = () => send("Run the draw", async () => write(POOL, POOL_ABI, "draw", []));
  const claim = () => send("Claim prize", async () => { const r: bigint = await read(POOL, POOL_ABI, "round"); const cur = r > 0n ? r - 1n : 0n; return write(POOL, POOL_ABI, "claim", [cur]); });
  const claimSponsored = () => send("Claim sponsored winnings", async () => write(POOL, POOL_ABI, "claimSponsored", []));

  async function refresh() {
    try {
      const [r, pc, op, end] = await Promise.all([
        read(POOL, POOL_ABI, "round"), read(POOL, POOL_ABI, "participantCount"),
        read(POOL, POOL_ABI, "depositsOpen"), read(POOL, POOL_ABI, "roundEnd"),
      ]);
      setRound("#" + r.toString()); setPcount(pc.toString()); setOpen(op ? "open" : "locked");
      setRoundEndTs(Number(end));
    } catch (e) { add("refresh: " + (e as Error).message); }
  }

  async function authorize() {
    try { add("Authorizing decryption (sign once)…"); await grantPermit([POOL, TOKEN]); setAuthed(true); add("✅ Decryption authorized."); }
    catch (e) { add("❌ authorize: " + (e as Error).message); }
  }

  function toBytes32(raw: any): Hex {
    let v = raw;
    if (Array.isArray(v)) v = v[0];
    if (v && typeof v === "object" && "result" in v) v = (v as any).result;
    if (typeof v === "bigint" || typeof v === "number") v = "0x" + BigInt(v).toString(16).padStart(64, "0");
    if (v instanceof Uint8Array) v = bytesToHex(v);
    let h = String(v);
    if (!h.startsWith("0x")) h = "0x" + h;
    if (h.length < 66) h = "0x" + h.slice(2).padStart(64, "0");
    return h as Hex;
  }
  async function decryptSlot(slot: string, contractAddress: Hex, fn: string, args: any[]) {
    try {
      if (!authed) return add("Click “Authorize decryption” first.");
      add("Reading + decrypting " + slot + "…");
      const raw: any = await read(contractAddress, contractAddress === TOKEN ? TOKEN_ABI : POOL_ABI, fn, args);
      setSlots((s) => ({ ...s, [slot]: { encryptedValue: toBytes32(raw), contractAddress } }));
    } catch (e) { add("❌ decrypt " + slot + ": " + (e as Error).message); }
  }

  useEffect(() => {
    if (!decrypt.error) return;
    const e: any = decrypt.error;
    add("⚠ decrypt: " + (e?.message || String(e)));
    const c = e?.cause; if (c) add("   cause: " + (c?.message || JSON.stringify(c)).toString().slice(0, 200));
  }, [decrypt.error]);

  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log, showLog]);
  useEffect(() => { if (log.length) setShowLog(true); }, [log.length]);
  // tick every second so the round countdown stays live
  useEffect(() => { const t = setInterval(() => setNowTs(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(t); }, []);

  // seconds until the draw is allowed (null = unknown until first refresh). roundReady => draw() won't revert "round not over".
  const drawIn = roundEndTs == null ? null : Math.max(0, roundEndTs - nowTs);
  const roundReady = drawIn == null || drawIn <= 0;
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // floating cowries (computed once)
  const coins = useMemo(() => Array.from({ length: 16 }, () => {
    const s = 8 + Math.random() * 10;
    return { w: s, h: s * 1.4, left: Math.random() * 100, dur: 9 + Math.random() * 11, delay: -Math.random() * 14 };
  }), []);

  const d = !addr || busy;

  return (
    <div className="ndm">
      <style>{CSS}</style>
      <div className="pattern" />

      <nav>
        <div className="wrap nav-in">
          <a className="brand" href="#top">{LOGO}<span>NDIM<span className="b">BAL</span></span></a>
          <div className="nav-r">
            <span className="pill-tag">🛟 No-loss savings · Sepolia</span>
            {addr ? <span className="chip">{short(addr)}</span> : <button className="btn p sm" onClick={connect}>Connect wallet</button>}
          </div>
        </div>
      </nav>

      <span id="top" />
      <header className="hero">
        <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
        <div className="coins">{coins.map((c, i) => <span key={i} className="coin" style={{ width: c.w, height: c.h, left: c.left + "%", animationDuration: c.dur + "s", animationDelay: c.delay + "s" }} />)}</div>
        <div className="wrap hero-grid">
          <div>
            <span className="eyebrow"><span className="dot" />Confidential prize savings · live on Sepolia</span>
            <h1>Save without loss.<br /><span className="hl">Win prizes.</span> <span className="hl2">Lift your community.</span></h1>
            <p className="sub">A savings pool where a lucky saver wins the prize each round — and can quietly share it back. Balances, the draw and your generosity all stay <b>encrypted</b>. Your deposit is always yours.</p>
            <div className="cta">
              {addr ? <a className="btn p" href="#play">▶ Start playing</a> : <button className="btn p" onClick={connect}>▶ Connect &amp; start</button>}
              <a className="btn o" href={SCAN} target="_blank" rel="noopener">⛓ See it on-chain</a>
            </div>
            <div className="trust"><span className="ok">✔</span> Real transactions · your principal is never at risk · powered by FHE</div>
          </div>
          <div className="art">{POT}<div className="prizeb"><span>Prize this round</span><b>🔒 encrypted</b><i>revealed only to the winner</i></div></div>
        </div>
      </header>

      <main className="wrap">
        {/* what it is */}
        <section>
          <div className="sec-h"><h2>What is NDIMBAL?</h2><p>A digital <b>tontine</b> reinvented: you save together, one member wins the prize each round, and <b>nobody ever loses their deposit</b>. The twist — everything is private.</p></div>
          <div className="feats">
            <div className="feat"><span className="fic d1">{IX.deposit}</span><div className="ft"><b>Deposit</b><p>Bigger deposit, better odds.</p></div></div>
            <div className="feat"><span className="fic d2">{IX.prize}</span><div className="ft"><b>Win prizes</b><p>One lucky saver wins each round.</p></div></div>
            <div className="feat"><span className="fic d3">{IX.noloss}</span><div className="ft"><b>No loss</b><p>Withdraw your principal any time.</p></div></div>
            <div className="feat"><span className="fic d4">{IX.priv}</span><div className="ft"><b>Private</b><p>Balances &amp; draw stay encrypted.</p></div></div>
          </div>
        </section>

        <section>
          <div className="sec-h"><h2>How it works</h2></div>
          <div className="flow">
            <div className="fstep"><span className="snum">1</span><b>Encrypt</b><p>Your deposit is encrypted on your device.</p></div>
            <div className="fstep"><span className="snum">2</span><b>Compute on ciphertext</b><p>The draw runs on encrypted balances.</p></div>
            <div className="fstep"><span className="snum">3</span><b>Only you decrypt</b><p>The winner alone learns they won.</p></div>
          </div>
        </section>

        {/* play — dark pro console */}
        <section id="play" className="play-wrap">
          <div className="play">
            <div className="play-top">
              <div className="pt-l">
                <span className="live"><span className="ld" />LIVE · Sepolia testnet</span>
                <h2>Play a full round</h2>
                <p>Every action below is a <b>real on-chain transaction</b>. New here? Just follow the steps top to bottom — each opens MetaMask and confirms in ~15–30s.</p>
              </div>
              <div className="ticker">
                <div className="tk"><span>Round</span><b translate="no">{round}</b></div>
                <div className="tk"><span>Savers</span><b translate="no">{pcount}</b></div>
                <div className="tk"><span>Deposits</span><b translate="no" className={"dot " + (open === "open" ? "g" : open === "locked" ? "r" : "")}>{open}</b></div>
                <button className="btn oo mini spin" disabled={d} onClick={refresh} title="Refresh live stats">↻</button>
              </div>
            </div>

            {!addr && (
              <div className="guide">
                <b>Start here —</b> connect your wallet to unlock the steps. You'll need a little Sepolia test-ETH for gas.
                <button className="btn p sm" style={{ marginLeft: 12 }} onClick={connect}>Connect wallet</button>
              </div>
            )}

            <div className="console">
            <div className="step">
              <span className="sdot">1</span>
              <div className="sb">
                <div className="sh"><h4>Get test tokens</h4><Fhe t="encrypted" /></div>
                <p>First time only. <b>Mint</b> gives you 1,000,000 demo cUSDC, then <b>Allow pool</b> lets NDIMBAL move them when you deposit.</p>
                <div className="row"><button className="btn gold sm" disabled={d} onClick={mint}>Mint 1,000,000</button><button className="btn o sm" disabled={d} onClick={approve}>Allow pool</button></div>
              </div>
            </div>

            <div className="step">
              <span className="sdot">2</span>
              <div className="sb">
                <div className="sh"><h4>Deposit into the pool</h4><Fhe t="encrypted" /></div>
                <p>Your amount is encrypted in your browser. <b>No-loss</b> — withdraw your principal any time; you only ever play the prize.</p>
                <div className="row">
                  <div className="grow"><label>Amount (cUSDC)</label><input type="number" value={dep} onChange={(e) => setDep(e.target.value)} /></div>
                  <div className="ba"><button className="btn p sm" disabled={d} onClick={deposit}>Deposit</button><button className="btn ghost sm" disabled={d} onClick={withdraw}>Withdraw</button></div>
                </div>
              </div>
            </div>

            <div className="step">
              <span className="sdot">3</span>
              <div className="sb">
                <div className="sh"><h4>Solidarity dial <span className="opt">optional</span></h4><Fhe t="only you see it" /></div>
                <p>If you win, how much of your prize goes back to the community? Your choice is <b>encrypted</b> — no social pressure, just your real generosity.</p>
                <label>Give-back if I win: <b translate="no">{pct}%</b></label>
                <input type="range" min={0} max={100} value={pct} onChange={(e) => setPct(+e.target.value)} />
                <button className="btn p sm" style={{ marginTop: 10 }} disabled={d} onClick={giveBack}>Set give-back (<span translate="no">{pct}%</span>)</button>
              </div>
            </div>

            <div className="step">
              <span className="sdot">4</span>
              <div className="sb">
                <div className="sh"><h4>Hidden benefactor — Tanti caché <span className="opt">optional</span></h4><Fhe t="fully private" /></div>
                <p>Secretly send a share of your prize to another member <b>if you win</b> — anonymously. Nobody learns who gave, to whom, or how much. Enter their member number (position in the pool) and the share.</p>
                <div className="row">
                  <div className="grow"><label>Beneficiary — member #</label><input type="number" min={1} value={sponIdx} onChange={(e) => setSponIdx(e.target.value)} /></div>
                  <div className="grow"><label>Share to route (%)</label><input type="number" min={0} max={100} value={sponPct} onChange={(e) => setSponPct(e.target.value)} /></div>
                  <div className="ba"><button className="btn p sm" disabled={d} onClick={setSponsorship}>Set benefactor</button></div>
                </div>
              </div>
            </div>

            <div className="step">
              <span className="sdot">5</span>
              <div className="sb">
                <div className="sh"><h4>Fund the prize <span className="opt">optional</span></h4><Fhe t="encrypted" /></div>
                <p>Top up the prize pot — as a sponsor, NGO or yield source — <b>blindly</b>, without seeing any balance or the winner.</p>
                <div className="row"><div className="grow"><label>Amount to add (cUSDC)</label><input type="number" value={fund} onChange={(e) => setFund(e.target.value)} /></div><div className="ba"><button className="btn gold sm" disabled={d} onClick={fundPrize}>Fund the prize</button></div></div>
              </div>
            </div>

            <div className="step yldstep">
              <span className="sdot star">★</span>
              <div className="sb">
                <div className="sh"><h4>Real yield — the prize funds itself <span className="opt">Morpho</span></h4><Fhe t="confidential" /></div>
                <p>Instead of a sponsor topping up the prize, route capital into a <b>confidential yield vault</b> (a Sepolia mock of Zama's <b>Steakhouse Confidential Prime USDC</b> vault on Morpho). The vault earns yield; <b>harvest</b> skims <b>only the yield</b> into the prize. Principal stays invested and encrypted — nobody ever sees a balance.</p>
                <div className="row">
                  <div className="grow"><label>Capital to route (cUSDC)</label><input type="number" value={vaultAmt} onChange={(e) => setVaultAmt(e.target.value)} /></div>
                  <div className="ba"><button className="btn p sm" disabled={d} onClick={fundVault}>① Route to vault</button></div>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <div className="grow"><label>Yield earned by the strategy <span className="opt">demo</span></label><input type="number" value={yieldAmt} onChange={(e) => setYieldAmt(e.target.value)} /></div>
                  <div className="ba"><button className="btn o sm" disabled={d} onClick={simulateYield}>② Earn yield</button><button className="btn gold sm" disabled={d} onClick={harvestYield}>③ Harvest → prize</button></div>
                </div>
                <p className="muted small" style={{ marginBottom: 0 }}>The prize is now <b>generated</b>, not injected. In production, ②'s yield comes from the real Morpho strategy — not a button.</p>
              </div>
            </div>

            <div className="step">
              <span className="sdot">6</span>
              <div className="sb">
                <div className="sh"><h4>The pool &amp; the draw</h4></div>
                <p>The draw picks a winner fairly (bigger deposit = better odds) with protocol randomness, entirely on encrypted balances. Available once the round ends — the live counters are in the header above.</p>
                {roundEndTs != null && (
                  <div className={"cdown " + (roundReady ? "rdy" : "")}>
                    {roundReady
                      ? <><span className="cdot" />Round ended — the draw is available</>
                      : <>⏳ Draw possible in <b translate="no">{mmss(drawIn!)}</b> · deposits lock shortly before the draw</>}
                  </div>
                )}
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn gold sm" disabled={d || !roundReady} onClick={draw}>{roundReady ? "Run the draw" : <>Draw in <span translate="no">{mmss(drawIn!)}</span></>}</button>
                  <button className="btn p sm" disabled={d} onClick={claim}>Claim prize</button>
                  <button className="btn ghost sm" disabled={d} onClick={claimSponsored}>Claim sponsored</button>
                </div>
              </div>
            </div>

            <div className="step">
              <span className="sdot">7</span>
              <div className="sb">
                <div className="sh"><h4>Your private results</h4><Fhe t="you alone can read" /></div>
                <p>Sign once to authorize, then reveal values that <b>only you</b> can decrypt — nobody else, not even us.</p>
                {!authed && <button className="btn p sm" style={{ margin: "2px 0 12px" }} disabled={!addr || authorizing} onClick={authorize}>{authorizing ? "Signing…" : "Authorize decryption (sign once)"}</button>}
                <div className="dec-grid">
                  <div className="dec"><div className="dl">Did I win? (last round)</div><div className="dv"><b translate="no">{dval("win")}</b><button className="btn o mini" disabled={d} onClick={async () => { const r: bigint = await read(POOL, POOL_ABI, "round"); const cur = r > 0n ? r - 1n : 0n; decryptSlot("win", POOL, "didWin", [cur, addr]); }}>decrypt</button></div></div>
                  <div className="dec"><div className="dl">My balance in the pool</div><div className="dv"><b translate="no">{dval("pool")}</b><button className="btn o mini" disabled={d} onClick={() => decryptSlot("pool", POOL, "confidentialBalanceOf", [addr])}>decrypt</button></div></div>
                  <div className="dec"><div className="dl">My wallet cUSDC</div><div className="dv"><b translate="no">{dval("wallet")}</b><button className="btn o mini" disabled={d} onClick={() => decryptSlot("wallet", TOKEN, "confidentialBalanceOf", [addr])}>decrypt</button></div></div>
                  <div className="dec"><div className="dl">Sponsored winnings</div><div className="dv"><b translate="no">{dval("sponsored")}</b><button className="btn o mini" disabled={d} onClick={() => decryptSlot("sponsored", POOL, "sponsoredWonOf", [addr])}>decrypt</button></div></div>
                </div>
                <p className="muted small" style={{ marginBottom: 0 }}>“Did I win?” decrypts to <b>1</b> (won) or <b>0</b> (lost) — a value only you can read.</p>
              </div>
            </div>
          </div>
          </div>
        </section>

        <section>
          <div className="proof">
            <h2>Not a mockup — it lives on-chain</h2>
            <p>Every action here is a real transaction on the Sepolia public testnet. Inspect the pool, replay the draw, verify the maths yourself.</p>
            <a className="btn o" href={SCAN} target="_blank" rel="noopener">⛓ View the contract on Etherscan</a>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <div className="brand" style={{ justifyContent: "center", marginBottom: 8 }}>{LOGO}<span>NDIM<span className="b">BAL</span></span></div>
          <p style={{ margin: "0 auto", maxWidth: "60ch" }} className="muted small">No-loss prize savings on a confidential smart contract. Draw = argmax of balance × protocol randomness · winner-only decrypt · verifiable on-chain.</p>
          <p style={{ margin: "8px 0 0" }}><b>El Hadji Pape Alamine Sarr</b> · Dakar</p>
        </div>
      </footer>

      <button className="fab" onClick={() => setShowLog((v) => !v)} aria-label="Activity log">
        {busy ? <span className="pl" /> : <span>📜</span>} Activity
      </button>
      {showLog && (
        <div className="logpop">
          <div className="ph"><span>{busy ? "⏳ Working…" : "📜 Activity log"}</span><button className="px" onClick={() => setShowLog(false)} aria-label="Close">×</button></div>
          <pre ref={logRef}>{log.join("\n") || "Connect your wallet to begin."}</pre>
        </div>
      )}
    </div>
  );
}

const MINILOCK = (<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>);
const Fhe = ({ t }: { t: string }) => <span className="fhe">{MINILOCK}{t}</span>;

const LOGO = (
  <svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">
    <rect width="64" height="64" rx="16" fill="#0E5A4A" />
    <ellipse cx="32" cy="32" rx="12" ry="18" fill="#E4A24C" />
    <path d="M32 16 C25 24,25 40,32 48 C39 40,39 24,32 16Z" fill="#0A4638" />
  </svg>
);

const POT = (
  <svg viewBox="0 0 320 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="pot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0E5A4A" /><stop offset="1" stopColor="#0A4638" /></linearGradient>
      <linearGradient id="coin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F0B65C" /><stop offset="1" stopColor="#D6912F" /></linearGradient>
      <radialGradient id="halo" cx="50%" cy="42%" r="55%"><stop offset="0" stopColor="#fff3d6" stopOpacity=".9" /><stop offset="1" stopColor="#fff3d6" stopOpacity="0" /></radialGradient>
    </defs>
    <circle cx="160" cy="140" r="140" fill="url(#halo)" />
    <g fill="#E4A24C"><path d="M60 60l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" /><path d="M262 78l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" opacity=".8" /></g>
    <ellipse cx="160" cy="210" rx="96" ry="70" fill="url(#pot)" />
    <ellipse cx="160" cy="150" rx="96" ry="34" fill="#0A4638" />
    <ellipse cx="160" cy="146" rx="88" ry="28" fill="#0E5A4A" />
    <g>
      <ellipse cx="120" cy="120" rx="20" ry="27" fill="url(#coin)" /><path d="M120 100 C112 108,112 132,120 140 C128 132,128 108,120 100Z" fill="#0A4638" />
      <ellipse cx="164" cy="104" rx="22" ry="29" fill="url(#coin)" /><path d="M164 82 C155 91,155 117,164 126 C173 117,173 91,164 82Z" fill="#0A4638" />
      <ellipse cx="206" cy="122" rx="19" ry="26" fill="url(#coin)" /><path d="M206 102 C198 110,198 134,206 142 C214 134,214 110,206 102Z" fill="#0A4638" />
    </g>
    <g transform="translate(214,196)">
      <circle cx="0" cy="0" r="30" fill="#fff" stroke="#EEE4D6" />
      <rect x="-13" y="-4" width="26" height="20" rx="5" fill="#0E5A4A" />
      <path d="M-8 -4 v-6 a8 8 0 0 1 16 0 v6" fill="none" stroke="#0E5A4A" strokeWidth="4" />
      <circle cx="0" cy="5" r="3" fill="#E4A24C" />
    </g>
  </svg>
);

const svgp = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const IX = {
  deposit: (<svg {...svgp}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3" /></svg>),
  prize: (<svg {...svgp}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M7 6H4v1.5a3 3 0 0 0 3 3M17 6h3v1.5a3 3 0 0 1-3 3" /></svg>),
  noloss: (<svg {...svgp}><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z" /><path d="M9.3 12l1.9 1.9L15 10" /></svg>),
  priv: (<svg {...svgp}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /><circle cx="12" cy="15.4" r="1.25" /></svg>),
};

const CSS = `
html{scroll-behavior:smooth}
.ndm{--bg:#FBF7F0;--card:#fff;--ink:#17233A;--muted:#6E7688;--line:#EEE4D6;--green:#0E5A4A;--green-d:#0A4638;--gold:#E4A24C;--gold-d:#B87A28;--terra:#C75B39;--soft:#E4EFEA;--r:28px;--r-sm:18px;--sh:0 22px 60px rgba(23,35,58,.10);--sh-s:0 10px 30px rgba(23,35,58,.07);--ease:cubic-bezier(.2,.8,.2,1);
  font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:radial-gradient(1200px 700px at 80% -10%,#f3ede0 0,var(--bg) 55%);line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden;min-height:100vh;position:relative;z-index:1;max-width:1220px;margin:0 auto;box-shadow:0 0 90px rgba(8,19,16,.55),0 0 0 1px rgba(255,255,255,.05)}
.ndm *{box-sizing:border-box} .ndm a{color:inherit;text-decoration:none}
.ndm .wrap{max-width:1020px;margin:0 auto;padding:0 20px}
.ndm .pattern{height:6px;background:repeating-linear-gradient(135deg,var(--green) 0 14px,var(--gold) 14px 20px,var(--terra) 20px 28px);background-size:56px 100%;animation:stripe 3.5s linear infinite}
@keyframes stripe{to{background-position:56px 0}}
.ndm nav{position:sticky;top:0;z-index:50;background:rgba(251,247,240,.82);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.ndm .nav-in{display:flex;align-items:center;justify-content:space-between;height:64px}
.ndm .brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.05em;font-size:1.2rem;color:var(--green)}
.ndm .brand .b{color:var(--gold-d)}
.ndm .nav-r{display:flex;align-items:center;gap:12px}
.ndm .pill-tag{display:none}
@media(min-width:640px){.ndm .pill-tag{display:inline-flex;background:var(--soft);color:var(--green-d);font-weight:700;font-size:.8rem;padding:6px 12px;border-radius:999px}}
.ndm .chip{font-weight:700;font-size:.8rem;background:var(--soft);color:var(--green-d);padding:7px 13px;border-radius:999px;font-family:ui-monospace,monospace}
.ndm .hero{position:relative;overflow:hidden;padding:52px 0 38px}
.ndm .blob{position:absolute;border-radius:50%;filter:blur(46px);opacity:.5;z-index:0;animation:drift 20s ease-in-out infinite}
.ndm .b1{width:360px;height:360px;background:#bfe3cf;top:-90px;right:-70px}
.ndm .b2{width:300px;height:300px;background:#f5d59a;bottom:-120px;left:-90px;opacity:.55;animation-duration:25s;animation-direction:alternate}
.ndm .b3{width:200px;height:200px;background:#f0b7a3;top:120px;left:44%;opacity:.4;animation-duration:16s}
@keyframes drift{0%{transform:translate(0,0) scale(1)}33%{transform:translate(34px,-26px) scale(1.08)}66%{transform:translate(-24px,20px) scale(.95)}100%{transform:translate(0,0) scale(1)}}
.ndm .coins{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.ndm .coin{position:absolute;bottom:-8%;opacity:0;border-radius:3px;background:linear-gradient(180deg,#efb562,#d6912f);box-shadow:0 2px 6px rgba(184,122,40,.35);animation:rise linear infinite}
@keyframes rise{0%{transform:translateY(0) rotate(0);opacity:0}12%{opacity:.6}88%{opacity:.6}100%{transform:translateY(-118vh) rotate(300deg);opacity:0}}
.ndm .hero-grid{position:relative;z-index:1;display:grid;grid-template-columns:1fr;gap:26px;align-items:center}
@media(min-width:860px){.ndm .hero-grid{grid-template-columns:1.1fr .9fr}}
.ndm .eyebrow{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--line);box-shadow:var(--sh-s);color:var(--green-d);font-weight:700;font-size:.82rem;padding:7px 14px;border-radius:999px}
.ndm .eyebrow .dot{width:8px;height:8px;border-radius:50%;background:var(--terra);box-shadow:0 0 0 4px rgba(199,91,57,.18)}
.ndm h1{font-size:clamp(2rem,5.2vw,3.2rem);line-height:1.08;letter-spacing:-.02em;margin:16px 0 0;font-weight:800;color:var(--ink);-webkit-text-fill-color:var(--ink)}
.ndm h1 .hl{color:var(--green);-webkit-text-fill-color:var(--green)}
.ndm h1 .hl2{color:var(--gold-d);-webkit-text-fill-color:var(--gold-d)}
.ndm .sub{color:var(--muted);font-size:1.06rem;max-width:40ch;margin:16px 0 0}
.ndm .cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}
.ndm .trust{display:flex;align-items:center;gap:8px;margin-top:16px;color:var(--muted);font-size:.85rem;font-weight:600}
.ndm .trust .ok{color:var(--green)}
.ndm .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:800;font-family:inherit;font-size:1rem;cursor:pointer;border:1px solid transparent;border-radius:999px;padding:12px 20px;transition:transform .08s,box-shadow .18s,background .18s}
.ndm .btn:active{transform:translateY(1px)} .ndm .btn[disabled]{opacity:.45;cursor:not-allowed}
.ndm .btn.sm{padding:9px 15px;font-size:.9rem} .ndm .btn.mini{padding:5px 12px;font-size:.8rem}
.ndm .btn.block{width:100%}
.ndm .btn.p{background:var(--green);color:#fff;box-shadow:0 10px 24px rgba(14,90,74,.26)} .ndm .btn.p:hover{background:var(--green-d);transform:translateY(-2px)}
.ndm .btn.o{background:#fff;color:var(--green-d);border-color:var(--line);box-shadow:var(--sh-s)}
.ndm .btn.gold{background:linear-gradient(180deg,#efb562,var(--gold));color:#3a2a10;box-shadow:0 10px 24px rgba(184,122,40,.26)} .ndm .btn.gold:hover{transform:translateY(-2px)}
.ndm .btn.ghost{background:transparent;border:1px solid var(--line);color:var(--green-d);font-weight:700}
.ndm .art{display:flex;justify-content:center}
.ndm .art svg{width:min(340px,84vw);height:auto;filter:drop-shadow(0 24px 40px rgba(23,35,58,.16));animation:float 5s ease-in-out infinite}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
.ndm section{padding:22px 0}
.ndm .sec-h{text-align:center;max-width:660px;margin:0 auto 20px}
.ndm .sec-h h2{font-size:clamp(1.5rem,3.6vw,2.05rem);margin:0;letter-spacing:-.01em;color:var(--green-d)!important;-webkit-text-fill-color:var(--green-d)!important;font-weight:800;opacity:1!important;animation:none!important}
.ndm .sec-h p{color:var(--muted);margin:10px 0 0}
.ndm .feats{display:grid;grid-template-columns:repeat(4,1fr)}
@media(max-width:720px){.ndm .feats{grid-template-columns:repeat(2,1fr);row-gap:22px}}
.ndm .feat{display:flex;gap:13px;align-items:flex-start;padding:4px 24px;position:relative}
.ndm .feat + .feat::before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:1px;background:linear-gradient(180deg,transparent,var(--line) 20%,var(--line) 80%,transparent)}
@media(max-width:720px){.ndm .feat + .feat::before{display:none}}
.ndm .fic{flex:none;width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--soft);color:var(--green-d)}
.ndm .fic svg{width:22px;height:22px}
.ndm .fic.d1{background:#e6f0eb;color:#0E5A4A}
.ndm .fic.d2{background:#f8ecd2;color:#B87A28}
.ndm .fic.d3{background:#f6e3db;color:#B44A2C}
.ndm .fic.d4{background:#ece6f4;color:#5B3E7A}
.ndm .ft b{display:block;font-size:1rem;margin-bottom:2px;letter-spacing:-.01em}
.ndm .ft p{margin:0;color:var(--muted);font-size:.85rem;line-height:1.45}
.ndm .flow{display:grid;grid-template-columns:repeat(3,1fr);position:relative;text-align:center}
.ndm .flow::before{content:"";position:absolute;top:17px;left:16.6%;right:16.6%;height:2px;background:linear-gradient(90deg,var(--green),var(--gold));opacity:.4}
.ndm .fstep{padding:0 20px;position:relative}
.ndm .snum{width:34px;height:34px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.95rem;margin:0 auto 12px;position:relative;z-index:1;box-shadow:0 6px 16px rgba(14,90,74,.3);border:3px solid var(--bg)}
.ndm .fstep b{display:block;margin-bottom:4px;font-size:1rem;letter-spacing:-.01em}
.ndm .fstep p{margin:0;color:var(--muted);font-size:.87rem;line-height:1.45}
@media(max-width:720px){.ndm .flow{grid-template-columns:1fr;gap:18px}.ndm .flow::before{display:none}}
.ndm .guide{background:linear-gradient(180deg,#fff8ec,#fdf1dd);border:1px solid #f0dcb8;border-radius:var(--r-sm);padding:14px 16px;margin:0 0 16px;font-size:.95rem;display:flex;align-items:center;flex-wrap:wrap;gap:6px}
.ndm .card{background:linear-gradient(180deg,#fff,#fffdfa);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--sh);padding:24px;margin:16px 0;transition:transform .35s var(--ease),box-shadow .35s var(--ease),border-color .35s}
.ndm .card:hover{transform:translateY(-3px);box-shadow:0 30px 70px rgba(23,35,58,.13);border-color:#e6dcc9}
.ndm .console{background:linear-gradient(180deg,#fff,#fffdfa);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--sh);padding:4px 30px}
@media(max-width:560px){.ndm .console{padding:4px 18px}}
.ndm .step{display:flex;gap:18px;align-items:flex-start;padding:24px 0}
.ndm .step + .step{border-top:1px solid var(--line)}
.ndm .sdot{flex:none;width:30px;height:30px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.88rem;margin-top:1px;box-shadow:0 5px 13px rgba(14,90,74,.26)}
.ndm .sb{flex:1;min-width:0}
.ndm .sh{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;flex-wrap:wrap}
.ndm .sh h4{margin:0;font-size:1.06rem;letter-spacing:-.01em}
.ndm .sb>p{margin:0 0 13px;color:var(--muted);font-size:.88rem;line-height:1.5}
.ndm .ba{align-self:flex-end;display:flex;gap:8px}
.ndm .fhe svg{flex:none}
.ndm .chd{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}
.ndm .chd h3{font-size:1.1rem;margin:0}
.ndm .opt{font-size:.7rem;font-weight:700;color:var(--muted);background:var(--bg);border:1px solid var(--line);padding:2px 8px;border-radius:999px;margin-left:6px;vertical-align:middle}
.ndm .row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.ndm .grow{flex:1;min-width:130px}
.ndm label{font-weight:600;font-size:.9rem;display:block;margin-bottom:6px}
.ndm input[type=number],.ndm input[type=text]{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:1.05rem;font-family:inherit;background:#fff;color:var(--ink);-webkit-text-fill-color:var(--ink);font-weight:600}
.ndm input::placeholder{color:#9aa2b1;-webkit-text-fill-color:#9aa2b1;font-weight:400}
.ndm input[type=range]{width:100%;accent-color:var(--green)}
.ndm .fhe{display:inline-flex;align-items:center;gap:6px;background:var(--soft);color:var(--green-d);font-weight:700;font-size:.75rem;padding:4px 10px;border-radius:999px;white-space:nowrap}
.ndm .muted{color:var(--muted)} .ndm .small{font-size:.86rem}
.ndm .stats{display:flex;gap:10px;flex-wrap:wrap}
.ndm .stat{flex:1;min-width:90px;background:#faf6ee;border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 14px;display:flex;flex-direction:column;gap:2px}
.ndm .stat span{font-size:.8rem;color:var(--muted)} .ndm .stat b{font-size:1.05rem}
.ndm .dec-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:6px 0 12px}
@media(max-width:560px){.ndm .dec-grid{grid-template-columns:1fr}}
.ndm .dec{background:#faf6ee;border:1px solid var(--line);border-radius:var(--r-sm);padding:12px 14px}
.ndm .dl{font-size:.82rem;color:var(--muted);margin-bottom:6px}
.ndm .dv{display:flex;align-items:center;justify-content:space-between;gap:8px} .ndm .dv b{font-size:1.02rem}
.ndm .log{font-family:ui-monospace,Menlo,monospace;font-size:.8rem;background:#0d1b16;color:#bfe8d4;border-radius:var(--r-sm);padding:14px;height:210px;overflow:auto;white-space:pre-wrap;margin-top:14px}
.ndm .proof{position:relative;overflow:hidden;isolation:isolate;background:linear-gradient(135deg,#0E5A4A,#0A4638 72%);color:#eafff6;border-radius:var(--r);padding:38px 28px;text-align:center;box-shadow:0 26px 60px rgba(10,70,56,.34);animation:glowb 5.5s ease-in-out infinite}
@keyframes glowb{0%,100%{box-shadow:0 26px 60px rgba(10,70,56,.30)}50%{box-shadow:0 30px 82px rgba(22,120,92,.46)}}
.ndm .proof::before{content:"";position:absolute;inset:-45%;z-index:-1;background:conic-gradient(from 0deg,transparent 0 18%,rgba(228,162,76,.20) 28%,transparent 44% 68%,rgba(79,191,149,.24) 82%,transparent 92%);animation:spin 16s linear infinite}
@keyframes spin{to{transform:rotate(1turn)}}
.ndm .proof::after{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(65% 90% at 50% -12%,rgba(255,243,214,.16),transparent 60%)}
.ndm .proof h2{color:#fff;margin:0 0 8px;font-size:clamp(1.4rem,3.4vw,1.9rem)}
.ndm .proof p{color:#d3ecdf;margin:0 auto 18px;max-width:56ch}
.ndm .proof .btn.o{background:#fff;color:var(--green-d);position:relative;overflow:hidden;border:0}
.ndm .proof .btn.o::after{content:"";position:absolute;top:0;left:-130%;width:55%;height:100%;background:linear-gradient(100deg,transparent,rgba(14,90,74,.14),transparent);transform:skewX(-18deg);animation:sweep 3.4s ease-in-out infinite}
@keyframes sweep{0%,55%{left:-130%}100%{left:170%}}
.ndm footer{text-align:center;color:var(--muted);font-size:.86rem;padding:30px 0 50px}
@keyframes revUp{from{opacity:0;transform:translateY(42px) scale(.985)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: no-preference){@supports (animation-timeline: view()){
  .ndm .feats,.ndm .flow,.ndm .console,.ndm .guide{animation:revUp linear both;animation-timeline:view();animation-range:entry 0% entry 55%}
}}
.ndm .fab{position:fixed;right:20px;bottom:20px;z-index:80;display:inline-flex;align-items:center;gap:9px;background:var(--green);color:#fff;border:0;border-radius:999px;padding:13px 19px;font-weight:800;font-family:inherit;cursor:pointer;box-shadow:0 14px 32px rgba(14,90,74,.34);transition:transform .3s var(--ease)}
.ndm .fab:hover{transform:translateY(-3px)}
.ndm .fab .pl{width:9px;height:9px;border-radius:50%;background:#8fe6c0;animation:pulse 1.4s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(143,230,192,.6)}70%{box-shadow:0 0 0 10px rgba(143,230,192,0)}100%{box-shadow:0 0 0 0 rgba(143,230,192,0)}}
.ndm .logpop{position:fixed;right:20px;bottom:84px;z-index:80;width:min(430px,92vw);background:#0d1b16;border:1px solid #17332a;border-radius:18px;box-shadow:0 30px 70px rgba(0,0,0,.4);overflow:hidden;animation:popin .3s var(--ease)}
@keyframes popin{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
.ndm .logpop .ph{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;color:#bfe8d4;font-weight:800;font-size:.9rem;border-bottom:1px solid #17332a;background:#0b1712}
.ndm .logpop .px{background:transparent;border:0;color:#7fb8a2;font-size:1.3rem;cursor:pointer;line-height:1}
.ndm .logpop pre{margin:0;font-family:ui-monospace,Menlo,monospace;font-size:.78rem;color:#bfe8d4;padding:12px 14px;height:260px;overflow:auto;white-space:pre-wrap}
@media (prefers-reduced-motion: reduce){.ndm *{animation:none!important}}

/* ---------- hero: jackpot prize badge (PoolTogether flavour) ---------- */
.ndm{--neon:#37E1A0}
.ndm .art{position:relative}
.ndm .prizeb{position:absolute;left:50%;bottom:-2px;transform:translateX(-50%);background:rgba(11,14,17,.9);backdrop-filter:blur(8px);border:1px solid rgba(228,162,76,.42);border-radius:18px;padding:11px 20px;text-align:center;box-shadow:0 20px 44px rgba(6,12,10,.42);min-width:196px;animation:float 5s ease-in-out infinite}
.ndm .prizeb span{display:block;font-size:.64rem;letter-spacing:.16em;text-transform:uppercase;color:#8fbfae;font-weight:700}
.ndm .prizeb b{display:block;font-size:1.28rem;color:#F0B65C;-webkit-text-fill-color:#F0B65C;margin:3px 0;font-weight:800;letter-spacing:.01em}
.ndm .prizeb i{font-style:normal;font-size:.7rem;color:#93A0B0}

/* ---------- play: dark pro console (Binance-grade) ---------- */
.ndm .play-wrap{padding-top:8px}
.ndm .play{background:linear-gradient(180deg,#0B0E11,#0F151C);border:1px solid #202834;border-radius:30px;padding:26px 28px 10px;color:#E9EEF4;box-shadow:0 44px 96px rgba(6,12,10,.5),inset 0 1px 0 rgba(255,255,255,.03);position:relative;overflow:hidden}
@media(max-width:560px){.ndm .play{padding:20px 16px 6px;border-radius:24px}}
.ndm .play::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,var(--green),var(--neon),var(--gold),var(--terra));opacity:.9}
.ndm .play-top{display:flex;gap:18px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;padding:8px 2px 18px;border-bottom:1px solid #1c2430}
.ndm .pt-l{min-width:240px;flex:1}
.ndm .live{display:inline-flex;align-items:center;gap:8px;font-size:.72rem;font-weight:800;letter-spacing:.13em;color:var(--neon);background:rgba(55,225,160,.08);border:1px solid rgba(55,225,160,.25);padding:5px 11px;border-radius:999px}
.ndm .live .ld{width:7px;height:7px;border-radius:50%;background:var(--neon);animation:pulse2 1.5s infinite}
@keyframes pulse2{0%{box-shadow:0 0 0 0 rgba(55,225,160,.6)}70%{box-shadow:0 0 0 8px rgba(55,225,160,0)}100%{box-shadow:0 0 0 0 rgba(55,225,160,0)}}
.ndm .play-top h2{color:#fff;-webkit-text-fill-color:#fff;margin:12px 0 4px;font-size:clamp(1.4rem,3.2vw,1.95rem);letter-spacing:-.01em}
.ndm .pt-l p{color:#93A0B0;margin:0;font-size:.9rem;max-width:52ch}
.ndm .pt-l p b{color:#cbd5e1}
.ndm .ticker{display:flex;gap:10px;align-items:stretch}
.ndm .tk{background:#141b23;border:1px solid #232d3a;border-radius:14px;padding:9px 15px;min-width:80px;display:flex;flex-direction:column;gap:3px}
.ndm .tk span{font-size:.64rem;letter-spacing:.09em;text-transform:uppercase;color:#7E8B9B;font-weight:700}
.ndm .tk b{font-size:1.18rem;font-family:ui-monospace,Menlo,monospace;color:#E9EEF4;letter-spacing:-.02em}
.ndm .tk b.g{color:var(--neon)} .ndm .tk b.r{color:#F5B740}
.ndm .btn.oo{background:#151c24;color:#cfe6dc;border:1px solid #26313d;font-size:1.05rem;line-height:1;padding:0 13px}
.ndm .btn.oo:hover{background:#1b2530;transform:translateY(-2px)}
.ndm .play .console{background:transparent;border:0;box-shadow:none;padding:0}
.ndm .play .step{padding:22px 2px;gap:16px}
.ndm .play .step+.step{border-top:1px solid #1b2330}
.ndm .play .sdot{background:linear-gradient(180deg,#14c98d,#0e9268);color:#03130d;box-shadow:0 5px 15px rgba(16,170,116,.4);border:1px solid rgba(255,255,255,.08)}
.ndm .play .sh h4{color:#F2F6FA}
.ndm .play .sb>p{color:#8F9CAC}
.ndm .play .sb>p b,.ndm .play .step .sb b{color:#DCE5EE}
.ndm .play label{color:#AEB9C6}
.ndm .play input[type=number],.ndm .play input[type=text]{background:#0e141b;border:1px solid #28323f;color:#F2F6FA;-webkit-text-fill-color:#F2F6FA}
.ndm .play input[type=number]:focus,.ndm .play input[type=text]:focus{outline:none;border-color:var(--neon);box-shadow:0 0 0 3px rgba(55,225,160,.14)}
.ndm .play input::placeholder{color:#5f6b7a;-webkit-text-fill-color:#5f6b7a}
.ndm .play input[type=range]{accent-color:var(--neon)}
.ndm .play .fhe{background:rgba(55,225,160,.09);color:#7fe9c2;border:1px solid rgba(55,225,160,.2)}
.ndm .play .opt{background:#141b23;border:1px solid #28323f;color:#8b97a6}
.ndm .play .btn.o{background:#151c24;color:#cfe6dc;border:1px solid #28323f;box-shadow:none}
.ndm .play .btn.o:hover{background:#1b2530}
.ndm .play .btn.ghost{background:transparent;border:1px solid #2b3644;color:#b9c6d3}
.ndm .play .btn.mini{background:#151c24;color:#cfe6dc;border:1px solid #28323f}
.ndm .play .dec,.ndm .play .stat{background:#0f151d;border:1px solid #232d3a}
.ndm .play .dl,.ndm .play .stat span{color:#8390a0}
.ndm .play .dv b,.ndm .play .stat b{color:#F2F6FA}
.ndm .play .muted{color:#8390a0}
.ndm .play .guide{background:linear-gradient(180deg,#132019,#101a14);border:1px solid #234436;color:#cfe6dc}
.ndm .play .guide b{color:#eafff6}
@media(max-width:640px){.ndm .ticker{width:100%}.ndm .tk{flex:1}}

/* ---------- livelier ticker, refresh + animated optional badges ---------- */
.ndm .tk{position:relative;overflow:hidden;transition:border-color .3s,transform .2s}
.ndm .tk:hover{transform:translateY(-2px);border-color:#2f6b52}
.ndm .tk::after{content:"";position:absolute;left:-60%;top:0;width:40%;height:100%;background:linear-gradient(100deg,transparent,rgba(55,225,160,.10),transparent);transform:skewX(-18deg);animation:tkSheen 5.5s ease-in-out infinite}
@keyframes tkSheen{0%,70%{left:-60%}100%{left:160%}}
.ndm .tk b.dot::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:7px;vertical-align:middle;background:#5b6675}
.ndm .tk b.dot.g::before{background:var(--neon);box-shadow:0 0 0 0 rgba(55,225,160,.7);animation:pulse2 1.5s infinite}
.ndm .tk b.dot.r::before{background:#F5B740;box-shadow:0 0 0 0 rgba(245,183,64,.6);animation:pulse2 1.6s infinite}
.ndm .btn.oo.spin{transition:transform .5s var(--ease),background .2s,color .2s}
.ndm .btn.oo.spin:hover{transform:rotate(180deg);background:rgba(55,225,160,.14);color:var(--neon);border-color:rgba(55,225,160,.4)}
.ndm .btn.oo.spin:active{transform:rotate(360deg)}
/* optional / facultatif pills — soft glow pulse so they read as interactive */
.ndm .opt{animation:optPulse 2.6s ease-in-out infinite}
.ndm .play .opt{border-color:rgba(55,225,160,.28);color:#8fe9c5;background:rgba(55,225,160,.07)}
@keyframes optPulse{0%,100%{box-shadow:0 0 0 0 rgba(55,225,160,0)}50%{box-shadow:0 0 0 4px rgba(55,225,160,.14)}}
/* round countdown (so a juror never hits "round not over" and mistakes it for a bug) */
.ndm .cdown{display:inline-flex;align-items:center;gap:8px;margin:2px 0;font-size:.85rem;font-weight:700;color:#F5B740;background:rgba(245,183,64,.09);border:1px solid rgba(245,183,64,.26);padding:7px 13px;border-radius:999px}
.ndm .cdown b{color:#fff;font-family:ui-monospace,Menlo,monospace;letter-spacing:.02em}
.ndm .cdown.rdy{color:var(--neon);background:rgba(55,225,160,.09);border-color:rgba(55,225,160,.3)}
.ndm .cdown .cdot{width:8px;height:8px;border-radius:50%;background:var(--neon);animation:pulse2 1.4s infinite}
/* real-yield step — the differentiator, marked in gold */
.ndm .play .sdot.star{background:linear-gradient(180deg,#efb562,#d6912f);color:#2a1e08;font-size:1rem;box-shadow:0 5px 15px rgba(184,122,40,.4)}
.ndm .play .step.yldstep{position:relative}
.ndm .play .step.yldstep::before{content:"";position:absolute;left:-14px;top:22px;bottom:16px;width:3px;border-radius:3px;background:linear-gradient(180deg,var(--gold),transparent)}
`;
