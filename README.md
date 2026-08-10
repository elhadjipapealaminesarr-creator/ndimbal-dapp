# NDIMBAL — live dApp

The frontend for **NDIMBAL**, a confidential no-loss prize-savings pool on **Zama fhEVM**.
Real transactions on Sepolia, **encrypted in your browser, decrypted only by you**.

**▶ Live:** https://ndimbal-rho.vercel.app
**Protocol / contracts / docs:** https://github.com/elhadjipapealaminesarr-creator/ndimbal

## What it does

A guided **7-step** flow to play a full confidential round:

1. **Get test tokens** — mint demo cUSDC and authorize the pool.
2. **Deposit** — FHE-encrypted client-side; withdraw any time (no loss).
3. **Solidarity dial** — privately pre-set what share of a win you'd give back.
4. **Tanti caché (hidden benefactor)** — secretly route a share of your prize to a chosen member if you win — nobody learns who, to whom, or how much.
5. **Fund the prize** — top up the pot blindly.
6. **The draw** — run the confidential weighted draw, then claim.
7. **Your private results** — decrypt *did I win?*, pool balance, wallet balance, sponsored winnings — values only you can read.

## Stack

- **React + TypeScript + Vite**
- **`@zama-fhe/sdk` + `@zama-fhe/react-sdk`** (Relayer SDK) for client-side FHE encryption and user-decryption
- **ethers v6** for wallet signing (MetaMask) + a dedicated Sepolia RPC for reads
- Interacts with the verified `NdimbalPool` contract (see the protocol repo)

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
```

> The FHE WebAssembly runtime needs cross-origin isolation. `vite.config.ts` sets
> `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`
> for local dev; `vercel.json` sets the same headers in production.

## Deploy

```bash
npm run build      # outputs to dist/
npx vercel --prod  # or any host that lets you set COOP/COEP headers
```

## Author

**El Hadji Pape Alamine Sarr** — Dakar, Senegal. License: BSD-3-Clause-Clear.
