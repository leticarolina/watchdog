import type { Request, Response, NextFunction } from 'express';
import { Keypair } from '@stellar/stellar-sdk';
import { simulateRequestPayment, executeRequestPayment } from '../contract.js';

// ─── Why not MPP's stellar.charge()? ────────────────────────────────────────
//
// MPP's built-in `stellar.charge()` method settles a payment by having the
// payer sign a plain Stellar Asset Contract `transfer` directly to the
// recipient's wallet. Watchdog's custody model requires the opposite: the
// Watchdog CONTRACT holds the funds and is the only party allowed to move
// them out, so settlement has to be a call to the contract's
// `request_payment` — which enforces the spending rules and performs the
// payout itself in the same transaction — not a wallet-to-wallet transfer.
// MPP has no built-in method for "call this Soroban contract function as the
// settlement mechanism," so this file keeps MPP's 402-negotiation *shape*
// (WWW-Authenticate challenge → credential → receipt) but replaces the
// settlement underneath with a direct request_payment call via contract.ts.
// This is a deliberate choice tied to the custody architecture, not a missed
// integration with MPP.

// ─── Config ──────────────────────────────────────────────────────────────────

/** Returns the current agent address — reads env each call so /reset takes effect immediately. */
function getAgent(): string {
  return process.env.AGENT_ADDRESS ?? 'GBCP3AAFAMUN5OCNGM3AIASNQSLFU7DTFI2LBEKIICFHJLZY2GYTCM6U';
}

/**
 * Convert stroops (integer) to a human-readable XLM decimal string, used only
 * for the 402 challenge description. request_payment itself takes raw
 * stroops (i128) — simulateRequestPayment/executeRequestPayment pass
 * requiredAmount through unconverted, so no decimal conversion happens on
 * the settlement path anymore.
 */
function stroopsToXlm(stroops: number): string {
  return (stroops / 10_000_000).toFixed(7);
}

/** Which env var to derive the payment recipient from — A is the allowlisted recipient, B deliberately is not. */
const DEFAULT_RECIPIENT_ENV_VAR = 'RECIPIENT_SECRET_KEY_A';

/** Derive the server's Stellar public key (= payment recipient) from env. */
function getRecipient(recipientEnvVar: string = DEFAULT_RECIPIENT_ENV_VAR): string {
  const secretKey = process.env[recipientEnvVar];
  if (!secretKey) throw new Error(`${recipientEnvVar} not set`);
  return Keypair.fromSecret(secretKey).publicKey();
}

/**
 * Returns the current agent's own secret key.
 *
 * A fully separate client that signs `request_payment` authorizations
 * client-side is out of scope for this pass. Instead, for demo purposes this
 * server also holds the current agent's secret key: once a credential header
 * is present on the request, the server signs and submits request_payment on
 * the agent's behalf synchronously, in-process — it doesn't cryptographically
 * verify an externally-signed credential. A production version would replace
 * this with real signature verification of a client-supplied authorization
 * instead of trusting header presence.
 */
function getAgentSecretKey(): string {
  const secretKey = process.env.AGENT_SECRET_KEY_A;
  if (!secretKey) throw new Error('AGENT_SECRET_KEY_A not set');
  return secretKey;
}

// ─── Payment verification ─────────────────────────────────────────────────────

export type PaymentReceipt = {
  /** Stellar transaction hash for the request_payment call. */
  txHash: string;
  /** Settlement method reported (always "watchdog-request-payment"). */
  method: string;
  /** RFC 3339 settlement timestamp. */
  timestamp: string;
};

type VerifyResult =
  | { status: 402; challenge: globalThis.Response }
  | { status: 200; receipt: PaymentReceipt; receiptHeader: string; recipient: string }
  | { blocked: true; reason: string; recipient: string };

/**
 * Verify an incoming payment credential and settle via request_payment.
 *
 * - Contract simulation rejects → returns blocked immediately, no payment issued.
 * - No credential → issues a 402 challenge (WWW-Authenticate header).
 * - Credential present → signs and submits request_payment, returns receipt metadata.
 */
async function verifyPayment(
  req: Request,
  requiredAmount: number,
  recipientEnvVar: string = DEFAULT_RECIPIENT_ENV_VAR,
): Promise<VerifyResult> {
  const agent = getAgent();
  const recipient = getRecipient(recipientEnvVar);

  // Contract simulation runs first — no payment is issued if the rules would reject.
  const simulation = await simulateRequestPayment(agent, recipient, requiredAmount);
  if (!simulation.approved) {
    return { blocked: true, reason: simulation.error ?? 'ContractRejected', recipient };
  }

  const credential = req.headers.authorization;

  if (!credential) {
    const request = {
      amount: String(requiredAmount), // stroops
      amountXlm: stroopsToXlm(requiredAmount),
      recipient,
      network: 'stellar:testnet',
      settlement: 'request_payment',
      description: 'Signed authorization for Watchdog request_payment — funds are released by the contract itself, not a wallet-to-wallet transfer.',
    };

    // Mirrors MPP's WWW-Authenticate challenge shape (`Payment realm=..., method=..., intent=..., request=...`)
    // so the negotiation shape stays consistent, even though settlement no longer goes through MPP.
    const wwwAuthenticate = `Payment realm="watchdog", method="watchdog-request-payment", intent="charge", request="${Buffer.from(
      JSON.stringify(request),
    ).toString('base64')}"`;

    const challenge = new globalThis.Response(JSON.stringify(request), {
      status: 402,
      headers: {
        'content-type': 'application/json',
        'www-authenticate': wwwAuthenticate,
      },
    });

    return { status: 402, challenge };
  }

  // Credential present — settle by calling request_payment. This call IS the
  // payment: on success the contract has already transferred `requiredAmount`
  // XLM to `recipient` itself, so there is no separate transfer step here.
  const exec = await executeRequestPayment(getAgentSecretKey(), recipient, requiredAmount);

  if (!exec.success) {
    // Contract state can change between the 402 challenge and settlement
    // (e.g. budget consumed by a different call in between) — this is a
    // normal rejection, not a server error, so it gets the same blocked
    // shape as the earlier simulation-based check, not a throw.
    return { blocked: true, reason: exec.error ?? 'SettlementFailed', recipient };
  }

  const receipt: PaymentReceipt = {
    txHash: exec.hash ?? '',
    method: 'watchdog-request-payment',
    timestamp: new Date().toISOString(),
  };

  const receiptHeader = Buffer.from(
    JSON.stringify({ reference: receipt.txHash, method: receipt.method, timestamp: receipt.timestamp }),
  ).toString('base64');

  return { status: 200, receipt, receiptHeader, recipient };
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * @param recipientEnvVar Which env var to derive the recipient from —
 *   defaults to RECIPIENT_SECRET_KEY_A (allowlisted). Pass
 *   'RECIPIENT_SECRET_KEY_B' to target the deliberately-unallowlisted demo
 *   recipient instead (see /analysis/basic-blocked in server.ts).
 */
export function requirePayment(requiredAmount: number, recipientEnvVar: string = DEFAULT_RECIPIENT_ENV_VAR) {
  return async function (req: Request, res: Response, next: NextFunction) {
    let result: VerifyResult;
    try {
      result = await verifyPayment(req, requiredAmount, recipientEnvVar);
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
          recipient: result.recipient,
        });
      }

    if (result.status === 402) {
      console.log('[payment] 402 — issuing request_payment challenge');
      // Pipe the Web Response headers into Express.
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
    res.locals.recipient = result.recipient;

    // Propagate the Payment-Receipt header so clients can confirm settlement.
    if (result.receiptHeader) {
      res.setHeader('payment-receipt', result.receiptHeader);
    }

    next();
  };
}
