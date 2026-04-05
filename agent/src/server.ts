import 'dotenv/config';
import express from 'express';

import { getLimits, recordPaymentState } from './contract.js';
import { PRICING } from './pricing.js';
import { requirePayment } from './middleware/payment.js';

const app = express();
const PORT = 3000;

const AGENT = process.env.AGENT_ADDRESS;

if (!AGENT) {
  throw new Error('AGENT_ADDRESS not set');
}

/* ─────────────────────────────────────────────
   BASIC ANALYSIS
───────────────────────────────────────────── */

app.get(
  '/analysis/basic',
  requirePayment(PRICING.basic),
  async (_req, res) => {
    console.log('[basic] hit');

    const paymentTxHash = res.locals.paymentReceipt?.txHash;

    const watchdog = await recordPaymentState(AGENT, PRICING.basic);

    if (!watchdog.success) {
      console.log('[basic] WATCHDOG STATE WRITE FAILED:', watchdog.error);

      return res.status(500).json({
        error: watchdog.error,
      });
    }

    console.log('[basic] APPROVED — paymentTxHash:', paymentTxHash);
    console.log('[basic] WATCHDOG STATE WRITTEN — watchdogTxHash:', watchdog.hash);

    return res.json({
      success: true,
      paymentTxHash,
      watchdogTxHash: watchdog.hash,
    });
  },
);

/* ─────────────────────────────────────────────
   DEEP ANALYSIS
───────────────────────────────────────────── */

app.get(
  '/analysis/deep',
  requirePayment(PRICING.deep),
  async (_req, res) => {
    console.log('[deep] hit');

    const paymentTxHash = res.locals.paymentReceipt?.txHash;

    const watchdog = await recordPaymentState(AGENT, PRICING.deep);

    if (!watchdog.success) {
      console.log('[deep] WATCHDOG STATE WRITE FAILED:', watchdog.error);

      return res.status(500).json({
        error: watchdog.error,
      });
    }

    console.log('[deep] APPROVED — paymentTxHash:', paymentTxHash);
    console.log('[deep] WATCHDOG STATE WRITTEN — watchdogTxHash:', watchdog.hash);

    return res.json({
      success: true,
      paymentTxHash,
      watchdogTxHash: watchdog.hash,
    });
  },
);

/* ─────────────────────────────────────────────
   CONFIG (CONTRACT LIMITS + PRICING)
───────────────────────────────────────────── */

app.get('/config', async (_req, res) => {
  console.log('[config] hit');

  const limits = await getLimits();

  if (!limits.success) {
    return res.status(500).json({
      error: limits.error,
    });
  }

  return res.json({
    contractLimits: {
      maxSinglePayment: limits.maxSinglePayment,
      dailyBudget: limits.dailyBudget,
    },
    endpointPricing: PRICING,
  });
});

app.listen(PORT, () => {
  console.log(`server running on http://localhost:${PORT}`);
});