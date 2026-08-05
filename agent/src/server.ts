import 'dotenv/config';
import express from 'express';
import cors from 'cors'
import { Keypair } from '@stellar/stellar-sdk';

import { getConfig, getAgentState, simulateRequestPayment } from './contract.js';
import { PRICING } from './pricing.js';
import { requirePayment } from './middleware/payment.js';
import { runAnalysis } from './client.js';

const app = express();
const PORT = 3000;

app.use(cors({
  origin: [
    'http://localhost:5175',
    'http://localhost:5173',
    'http://localhost:5176',
    'https://watchdog-agent.vercel.app',
  ],
  methods: ['GET', 'POST'],
}))

if (!process.env.AGENT_ADDRESS) {
  throw new Error('AGENT_ADDRESS not set');
}

// Agent pool rotation
const agentPool = (process.env.AGENT_POOL ?? '').split(',').filter(Boolean);
let currentAgentIndex = 0;

/** Derive the server's Stellar public key (= payment recipient) from env. Mirrors payment.ts's own helper. */
function getRecipient(): string {
  const secretKey = process.env.RECIPIENT_SECRET_KEY_A;
  if (!secretKey) throw new Error('RECIPIENT_SECRET_KEY_A not set');
  return Keypair.fromSecret(secretKey).publicKey();
}

/* ─────────────────────────────────────────────
   BASIC ANALYSIS
───────────────────────────────────────────── */

app.get(
  '/analysis/basic',
  requirePayment(PRICING.basic),
  async (_req, res) => {
    console.log('[basic] hit');

    // Settlement already happened inside requirePayment() — request_payment
    // both verified and paid out in the same call, so there's nothing left
    // to record here.
    console.log('[basic] APPROVED — txHash:', res.locals.paymentReceipt?.txHash);

    return res.json({
      success: true,
      txHash: res.locals.paymentReceipt?.txHash,
      recipient: res.locals.recipient,
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

    // Settlement already happened inside requirePayment() — request_payment
    // both verified and paid out in the same call, so there's nothing left
    // to record here.
    console.log('[deep] APPROVED — txHash:', res.locals.paymentReceipt?.txHash);

    return res.json({
      success: true,
      txHash: res.locals.paymentReceipt?.txHash,
      recipient: res.locals.recipient,
    });
  },
);

/* ─────────────────────────────────────────────
   BASIC ANALYSIS — BLOCKED RECIPIENT DEMO
   Same as /analysis/basic but targets recipient B,
   which is deliberately never allowlisted — this
   always returns { blocked: true, reason: 'RecipientNotAllowed' }.
───────────────────────────────────────────── */

app.get(
  '/analysis/basic-blocked',
  requirePayment(PRICING.basic, 'RECIPIENT_SECRET_KEY_B'),
  async (_req, res) => {
    // In practice this handler never runs — recipient B is never allowlisted,
    // so requirePayment() always short-circuits with a blocked response first.
    console.log('[basic-blocked] APPROVED — txHash:', res.locals.paymentReceipt?.txHash);

    return res.json({
      success: true,
      txHash: res.locals.paymentReceipt?.txHash,
      recipient: res.locals.recipient,
    });
  },
);

/* ─────────────────────────────────────────────
   RUN ENDPOINTS — browser-friendly wrappers
   Handle the 402 challenge/retry internally so
   the browser never has to deal with it.
───────────────────────────────────────────── */

app.get('/run/basic', async (_req, res) => {
  console.log('[run/basic] triggered');
  try {
    const result = await runAnalysis('/analysis/basic');
    console.log('[run/basic] result:', JSON.stringify(result));
    return res.json(result);
  } catch (err: any) {
    console.error('[run/basic] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/run/deep', async (_req, res) => {
  console.log('[run/deep] triggered');
  try {
    const result = await runAnalysis('/analysis/deep');
    console.log('[run/deep] result:', JSON.stringify(result));
    return res.json(result);
  } catch (err: any) {
    console.error('[run/deep] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/run/basic-blocked', async (_req, res) => {
  console.log('[run/basic-blocked] triggered');
  try {
    const result = await runAnalysis('/analysis/basic-blocked');
    console.log('[run/basic-blocked] result:', JSON.stringify(result));
    return res.json(result);
  } catch (err: any) {
    console.error('[run/basic-blocked] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────────
   CONFIG (CONTRACT LIMITS + PRICING)
───────────────────────────────────────────── */

app.get('/config', async (_req, res) => {
  console.log('[config] hit');

  const config = await getConfig();

  if (!config.success) {
    return res.status(500).json({
      error: config.error,
    });
  }

  return res.json({
    contractLimits: {
      maxSinglePayment: config.maxSinglePayment,
      budgetCap: config.budgetCap,
      windowSeconds: config.windowSeconds,
    },
    endpointPricing: PRICING,
  });
});

/* ─────────────────────────────────────────────
   AGENT POOL
───────────────────────────────────────────── */

function resolvedSpent(
  state: { success: boolean; cumulativeSpent?: number; windowStart?: number },
  windowSeconds: number,
): number {
  if (!state.success) return 0;
  const cumulative = (state as any).cumulativeSpent ?? 0;
  const windowStart = (state as any).windowStart ?? 0;
  // Apply the same window expiry the contract uses — if the window has passed,
  // the stored value is stale (lazy reset) so treat the agent as fresh.
  const nowSec = Math.floor(Date.now() / 1000);
  if (windowStart > 0 && nowSec - windowStart >= windowSeconds) return 0;
  return cumulative;
}

app.get('/agent', async (_req, res) => {
  const agentAddr = process.env.AGENT_ADDRESS!;
  const [state, config] = await Promise.all([
    getAgentState(agentAddr).catch(() => ({ success: false })),
    getConfig().catch(() => ({ success: false })),
  ]);
  const windowSeconds = config.success ? ((config as any).windowSeconds ?? 86400) : 86400;
  return res.json({
    currentAgent: agentAddr,
    agentIndex: currentAgentIndex,
    totalAgents: agentPool.length,
    cumulativeSpent: resolvedSpent(state as any, windowSeconds),
    windowStart: (state as any).windowStart ?? 0,
  });
});

app.get('/agent/state', async (_req, res) => {
  const agentAddr = process.env.AGENT_ADDRESS!;
  const [state, config] = await Promise.all([
    getAgentState(agentAddr).catch(() => ({ success: false })),
    getConfig().catch(() => ({ success: false })),
  ]);
  const windowSeconds = config.success ? ((config as any).windowSeconds ?? 86400) : 86400;
  return res.json({
    spent: resolvedSpent(state as any, windowSeconds),
    budgetCap: config.success ? (config as any).budgetCap : 0,
    maxSinglePayment: config.success ? (config as any).maxSinglePayment : 0,
  });
});

app.post('/reset', async (_req, res) => {
  const recipient = getRecipient();
  const config = await getConfig().catch(() => ({ success: false }));
  const windowSeconds = config.success ? ((config as any).windowSeconds ?? 86400) : 86400;

  // Walk the pool from the next index to find a fresh agent
  // (one that can still make at least a basic payment without BudgetCapExceeded)
  const start = (currentAgentIndex + 1) % agentPool.length;
  let found = false;
  const failureReasons = new Set<string>();

  for (let i = 0; i < agentPool.length; i++) {
    const idx = (start + i) % agentPool.length;
    const candidate = agentPool[idx];
    if (!candidate) continue;
    const [check, agentState] = await Promise.all([
      simulateRequestPayment(candidate, recipient, PRICING.basic),
      getAgentState(candidate).catch(() => ({ success: false })),
    ]);
    const spent = resolvedSpent(agentState as any, windowSeconds);
    const windowStart = (agentState as any).windowStart ?? 0;
    const nowSec = Math.floor(Date.now() / 1000);
    console.log(`[reset] agent[${idx}] ${candidate.slice(0, 8)}… approved=${check.approved} reason=${check.error ?? 'ok'} spent=${spent} windowStart=${windowStart} age=${nowSec - windowStart}s`);
    if (check.approved) {
      currentAgentIndex = idx;
      process.env.AGENT_ADDRESS = candidate;
      found = true;
      break;
    }
    failureReasons.add(check.error ?? 'Unknown');
  }

  if (!found) {
    // Lead with the actionable cause: an empty vault blocks every agent
    // regardless of budget/window state, so it's a different fix (deposit
    // funds) than "wait for the window to reset."
    const message = failureReasons.has('InsufficientVaultBalance')
      ? 'Vault balance too low — deposit more funds before resetting'
      : 'All agents exhausted — wait for the budget window to reset';
    console.warn(`[reset] no agent qualified — reasons=[${Array.from(failureReasons).join(', ')}]`);
    return res.status(503).json({ error: message });
  }

  const agentAddr = process.env.AGENT_ADDRESS!;
  const state = await getAgentState(agentAddr).catch(() => ({ success: false }));
  console.log(`[reset] switched to agent[${currentAgentIndex}]: ${agentAddr}`);

  return res.json({
    success: true,
    currentAgent: agentAddr,
    agentIndex: currentAgentIndex,
    totalAgents: agentPool.length,
    cumulativeSpent: state.success ? ((state as any).cumulativeSpent ?? 0) : 0,
    windowStart: state.success ? ((state as any).windowStart ?? 0) : 0,
  });
});

app.listen(PORT, () => {
  console.log(`server running on http://localhost:${PORT}`);
});
