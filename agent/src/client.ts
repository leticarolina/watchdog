/**
 * Internal MPP client — mirrors what pay-test.ts does but runs inside the server process.
 * The /run/* endpoints call these instead of the browser hitting /analysis/* directly.
 */
import { Mppx } from 'mppx/client';
import { stellar } from '@stellar/mpp/charge/client';

const BASE = 'http://localhost:3000';

let _mppx: ReturnType<typeof Mppx.create> | null = null;

function getMppx() {
  if (!_mppx) {
    const secretKey = process.env.STELLAR_SECRET_KEY;
    if (!secretKey) throw new Error('STELLAR_SECRET_KEY not set');
    _mppx = Mppx.create({
      polyfill: false, // don't touch globalThis.fetch
      methods: [stellar.charge({ secretKey })],
    });
  }
  return _mppx;
}

export type AnalysisResult =
  | { success: true; paymentTxHash: string; watchdogTxHash: string }
  | { blocked: true; reason: string }
  | { error: string };

/**
 * Run an analysis endpoint through the full MPP payment cycle.
 *
 * Flow:
 *   1. mppx.fetch hits /analysis/* — server returns 402 + challenge
 *      (unless contract pre-check already blocks it — then returns 200 blocked)
 *   2. mppx handles challenge: signs Soroban SAC transfer, retries with credential
 *   3. Server broadcasts tx, confirms, returns { success, paymentTxHash, watchdogTxHash }
 */
export async function runAnalysis(
  path: '/analysis/basic' | '/analysis/deep',
): Promise<AnalysisResult> {
  const mppx = getMppx();

  let response: Response;
  response = await mppx.fetch(`${BASE}${path}`);

  // Extract payment TX hash from the receipt header (base64 JSON, field = "reference")
  let paymentTxHash = '';
  const receiptHeader = response.headers.get('payment-receipt');
  if (receiptHeader) {
    try {
      const receipt = JSON.parse(Buffer.from(receiptHeader, 'base64').toString('utf-8'));
      paymentTxHash = receipt.reference ?? '';
    } catch {
      // malformed receipt — proceed without hash
    }
  }

  const body = await response.json() as Record<string, unknown>;

  if (body.blocked) {
    return { blocked: true, reason: String(body.reason ?? 'ContractRejected') };
  }

  if (body.success) {
    return {
      success: true,
      paymentTxHash: String(body.paymentTxHash ?? paymentTxHash),
      watchdogTxHash: String(body.watchdogTxHash ?? ''),
    };
  }

  return { error: String(body.error ?? 'Unknown error') };
}
