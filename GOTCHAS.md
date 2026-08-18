# GOTCHAS.md

Issues hit while building Watchdog on Stellar during the Stellar Agents Hackathon 2026.
Helpful for those building with Soroban, x402, or the MPP SDK for the first time.

---

## Soroban / Rust

**1. WASM target changed in CLI 25.x**
The new Stellar CLI uses `wasm32v1-none` not `wasm32-unknown-unknown`. Adding the wrong target compiles fine locally but the build fails silently on deploy.

```bash
rustup target add wasm32v1-none
```

**2. Function names become hyphenated in the CLI**
Rust uses underscores. The Stellar CLI converts them to hyphens when invoking via `stellar contract invoke`.

```bash
# Contract function: request_payment
# CLI invocation: -- request-payment
```

**3. Always run `stellar contract build` from project root**
The WASM output lands at the root-level `target/` folder. Running the build from inside `contracts/` makes the deploy command fail with "file not found."

**4. `#[contractevent]` macro doesn't generate `.emit()` in SDK v25**
The deprecation warning on `env.events().publish()` tells you to use `#[contractevent]`, but the generated struct has no `.emit()` method. Fall back to `env.events().publish()` bcs it works fine so far.

---

## MPP SDK / x402

**5. Express v5 is required**
`mppx` has a hard peer dependency on Express v5. Installing v4 gives a dependency resolution error that's easy to miss.

```bash
npm install express@^5.0.0
```

**6. Lazy-initialize the MPP SDK**
Initializing `Mppx.create()` at module load time means dotenv hasn't run yet and `process.env` values are undefined.

```typescript
let _mppx: ReturnType<typeof Mppx.create> | null = null
function getMppx() {
  if (!_mppx) _mppx = Mppx.create({ secretKey: process.env.STELLAR_SECRET_KEY! })
  return _mppx
}
```

**7. TX hash is called `reference` in the payment receipt**
The `payment-receipt` header is base64-encoded JSON. The transaction hash field is `reference`, not `hash` or `txHash`.

```typescript
const receipt = JSON.parse(atob(res.headers.get('payment-receipt') ?? ''))
const txHash = receipt.reference
```

**8. Import `rpc`, not `SorobanRpc`**

```typescript
import { rpc } from '@stellar/stellar-sdk'
const server = new rpc.Server(url) // don't name your variable 'rpc' — it shadows the import
```

**9. `@stellar/mpp` requires `@stellar/stellar-sdk@^14.x`**
Version 15 breaks the peer dependency resolution. Pin to v14.

```bash
npm install @stellar/stellar-sdk@^14.6.1
```

**10. `mppx` requires `viem` as an undeclared peer dependency**
The server crashes on Railway with `Cannot find package 'viem'`. It's not listed in `mppx` dependencies but is required at runtime.

```bash
npm install viem
```

---

## Deployment

**11. Railway needs `.npmrc` for peer dep conflicts**
Create `agent/.npmrc` with:

```bash
legacy-peer-deps=true
```

**12. Stellar accounts don't exist until funded**
Unlike EVM where an address is valid immediately, a Stellar account doesn't exist on-chain until it receives at least 1 XLM. Use Friendbot on testnet:

```bash
stellar keys fund mykey --network testnet
```

---

Built during Stellar Agents Hackathon 2026 — [@letiweb3](https://x.com/letiweb3)
