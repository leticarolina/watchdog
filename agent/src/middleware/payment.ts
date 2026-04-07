import type { Request, Response, NextFunction } from 'express';
import { Mppx, stellar } from '@stellar/mpp/charge/server';
import { XLM_SAC_TESTNET } from '@stellar/mpp';
import { Keypair } from '@stellar/stellar-sdk';
import { checkPayment } from '../contract.js';

// ─── Config ──────────────────────────────────────────────────────────────────

/** Returns the current agent address — reads env each call so /reset takes effect immediately. */
function getAgent(): string {
  return process.env.AGENT_ADDRESS ?? 'GBCP3AAFAMUN5OCNGM3AIASNQSLFU7DTFI2LBEKIICFHJLZY2GYTCM6U';
}

/** Convert stroops (integer) to the XLM decimal string the MPP SDK expects. */
function stroopsToXlm(stroops: number): string {
  return (stroops / 10_000_000).toFixed(7);
}

/** Derive the server's Stellar public key (= payment recipient) from env. */
function getRecipient(): string {
  const secretKey = process.env.STELLAR_SECRET_KEY;
  if (!secretKey) throw new Error('STELLAR_SECRET_KEY not set');
  return Keypair.fromSecret(secretKey).publicKey();
}

// ─── Lazy singleton ───────────────────────────────────────────────────────────
// Constructed on first use so dotenv has already run when this module loads.

function createMppx() {
  return Mppx.create({
    // Used for HMAC-bound challenge IDs — re-uses the Stellar secret key.
    secretKey: process.env.STELLAR_SECRET_KEY,
    methods: [
      stellar.charge({
        recipient: getRecipient(), // where XLM lands on Stellar testnet
        currency: XLM_SAC_TESTNET,
        network: 'stellar:testnet',
      }),
    ],
  });
}

let _mppx: ReturnType<typeof createMppx> | null = null;

function getMppx() {
  if (!_mppx) _mppx = createMppx();
  return _mppx;
}

// ─── Request adapter ─────────────────────────────────────────────────────────

/** Convert an Express request to a Web Fetch Request for the MPP SDK. */
function toWebRequest(req: Request): globalThis.Request {
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
  }
  return new globalThis.Request(url, { method: req.method, headers });
}

// ─── Payment verification ─────────────────────────────────────────────────────

export type PaymentReceipt = {
  /** Stellar transaction hash for the XLM transfer. */
  txHash: string;
  /** Payment method reported by the SDK (e.g. "stellar"). */
  method: string;
  /** RFC 3339 settlement timestamp from the SDK. */
  timestamp: string;
};

type VerifyResult =
  | { status: 402; challenge: globalThis.Response }
  | { status: 200; receipt: PaymentReceipt; receiptHeader: string }
  | { blocked: true; reason: string };

/**
 * Verify an incoming MPP payment credential.
 *
 * - Contract rejects → returns blocked immediately, no payment issued.
 * - No credential → issues a 402 challenge (WWW-Authenticate header).
 * - Invalid credential → returns 402 (wrong recipient, network, or amount).
 * - Valid credential → verifies on-chain and returns receipt metadata.
 *
 * Network (stellar:testnet) and recipient validation are handled by the SDK.
 */
async function verifyPayment(req: Request, requiredAmount: number): Promise<VerifyResult> {
  // Contract simulation runs first — no payment is issued if the rules would reject.
  const simulation = await checkPayment(getAgent(), requiredAmount);
  if (!simulation.approved) {
    return { blocked: true, reason: simulation.error ?? 'ContractRejected' };
  }

  const mppx = getMppx();
  const webRequest = toWebRequest(req);

  // TODO: MPP verification happens here — mppx submits or verifies the
  // Soroban SAC transfer and waits for on-chain confirmation.
  const chargeHandler = mppx['stellar/charge'];
  const result = await chargeHandler({
    amount: stroopsToXlm(requiredAmount),
    description: 'Watchdog analysis payment',
  })(webRequest);

  if (result.status === 402) {
    return { status: 402, challenge: result.challenge };
  }

  // TODO: amount validation is enforced by the SDK matching the challenge amount
  // to the credential amount. Add extra checks here if needed.

  // Extract the Payment-Receipt header by wrapping a dummy response.
  // withReceipt() adds the "payment-receipt" header — we only need its value.
  const receiptResponse = result.withReceipt(new globalThis.Response(''));
  const receiptHeader = receiptResponse.headers.get('payment-receipt') ?? '';

  // TODO: attach additional payment metadata (sender address, externalId, etc.)
  // once the SDK exposes the full receipt object directly.
  let txHash = '';
  let method = 'stellar';
  let timestamp = new Date().toISOString();
  try {
    const decoded = JSON.parse(Buffer.from(receiptHeader, 'base64').toString('utf-8'));
    txHash = decoded.reference ?? '';
    method = decoded.method ?? method;
    timestamp = decoded.timestamp ?? timestamp;
  } catch {
    // Malformed receipt header — proceed without hash, route handler will still work.
  }

  return {
    status: 200,
    receipt: { txHash, method, timestamp },
    receiptHeader,
  };
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export function requirePayment(requiredAmount: number) {
  return async function (req: Request, res: Response, next: NextFunction) {
    let result: VerifyResult;
    try {
      result = await verifyPayment(req, requiredAmount);
    } catch (err: any) {
      console.error('[payment] verification error:', err.message);
      return res.status(500).json({ error: 'payment verification failed' });
    }

    if ('blocked' in result) {
        console.log(
          `[payment] blocked agent=${getAgent()} endpoint=${req.originalUrl} reason=${result.reason} amount=${requiredAmount}`,
        );
      
        return res.json({
          blocked: true,
          reason: result.reason,
        });
      }

    if (result.status === 402) {
      console.log('[payment] 402 — issuing MPP challenge');
      // Pipe the SDK's Web Response headers into Express.
      result.challenge.headers.forEach((value: string, key: string) => {
        res.setHeader(key, value);
      });
      const body = await result.challenge.text();
      return res.status(402).send(body);
    }

    console.log('[payment] verified — txHash:', result.receipt.txHash);

    // Attach verified payment metadata for downstream route handlers.
    res.locals.requiredAmount = requiredAmount;
    res.locals.paymentReceipt = result.receipt;

    // Propagate the Payment-Receipt header so clients can confirm settlement.
    if (result.receiptHeader) {
      res.setHeader('payment-receipt', result.receiptHeader);
    }

    next();
  };
}
