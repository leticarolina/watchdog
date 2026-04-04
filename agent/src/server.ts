import 'dotenv/config';
import express from 'express';

import { checkPayment, getLimits } from './contract.js';
import { PRICING } from './pricing.js';
import { requirePayment } from './middleware/payment.js';

const app = express();
const PORT = 3000;

const AGENT = 'GBCP3AAFAMUN5OCNGM3AIASNQSLFU7DTFI2LBEKIICFHJLZY2GYTCM6U';

app.get('/analysis/basic', requirePayment(PRICING.basic), async (_req, res) => {
  console.log('[basic] hit');

  const amount = PRICING.basic;

  const result = await checkPayment(AGENT, amount);

  if (!result.approved) {
    console.log('[basic] BLOCKED:', result.error);

    return res.json({
      blocked: true,
      reason: result.error,
    });
  }

  const txHash = res.locals.paymentReceipt?.txHash;
  console.log('[basic] APPROVED — txHash:', txHash);

  return res.json({
    success: true,
    txHash,
  });
});

app.get('/analysis/deep', requirePayment(PRICING.deep), async (_req, res) => {
  console.log('[deep] hit');

  const amount = PRICING.deep;

  const result = await checkPayment(AGENT, amount);

  if (!result.approved) {
    console.log('[deep] BLOCKED:', result.error);

    return res.json({
      blocked: true,
      reason: result.error,
    });
  }

  const txHash = res.locals.paymentReceipt?.txHash;
  console.log('[deep] APPROVED — txHash:', txHash);

  return res.json({
    success: true,
    txHash,
  });
});

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