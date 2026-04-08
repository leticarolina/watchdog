import 'dotenv/config';
import express from 'express';
import cors from 'cors'

import { getLimits, recordPaymentState, getAgentState, checkPayment } from './contract.js';
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

/* ─────────────────────────────────────────────
   BASIC ANALYSIS
───────────────────────────────────────────── */

app.get(
  '/analysis/basic',
  requirePayment(PRICING.basic),
  async (_req, res) => {
    console.log('[basic] hit');

    const paymentTxHash = res.locals.paymentReceipt?.txHash;

    const watchdog = await recordPaymentState(process.env.AGENT_ADDRESS!, PRICING.basic);

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

    const watchdog = await recordPaymentState(process.env.AGENT_ADDRESS!, PRICING.deep);

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
   RUN ENDPOINTS — browser-friendly wrappers
   Use mppx client internally so the browser
   never has to handle the 402/MPP cycle.
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

/* ─────────────────────────────────────────────
   AGENT POOL
───────────────────────────────────────────── */

function resolvedSpent(state: { success: boolean; cumulative24h?: number; dayStart?: number }): number {
  if (!state.success) return 0;
  const cumulative = (state as any).cumulative24h ?? 0;
  const dayStart = (state as any).dayStart ?? 0;
  // Apply the same 24h expiry the contract uses — if the window has passed,
  // the stored value is stale (lazy reset) so treat the agent as fresh.
  const nowSec = Math.floor(Date.now() / 1000);
  if (dayStart > 0 && nowSec - dayStart >= 86400) return 0;
  return cumulative;
}

app.get('/agent', async (_req, res) => {
  const agentAddr = process.env.AGENT_ADDRESS!;
  const state = await getAgentState(agentAddr).catch(() => ({ success: false }));
  return res.json({
    currentAgent: agentAddr,
    agentIndex: currentAgentIndex,
    totalAgents: agentPool.length,
    cumulative24h: resolvedSpent(state as any),
  });
});

app.get('/agent/state', async (_req, res) => {
  const agentAddr = process.env.AGENT_ADDRESS!;
  const [state, limits] = await Promise.all([
    getAgentState(agentAddr).catch(() => ({ success: false })),
    getLimits().catch(() => ({ success: false })),
  ]);
  return res.json({
    spent: resolvedSpent(state as any),
    dailyBudget: limits.success ? (limits as any).dailyBudget : 0,
    maxSinglePayment: limits.success ? (limits as any).maxSinglePayment : 0,
  });
});

app.post('/reset', async (_req, res) => {
  // Walk the pool from the next index to find a fresh agent
  // (one that can still make at least a basic payment without DailyBudgetExceeded)
  const start = (currentAgentIndex + 1) % agentPool.length;
  let found = false;

  for (let i = 0; i < agentPool.length; i++) {
    const idx = (start + i) % agentPool.length;
    const candidate = agentPool[idx];
    if (!candidate) continue;
    const [check, agentState] = await Promise.all([
      checkPayment(candidate, PRICING.basic),
      getAgentState(candidate).catch(() => ({ success: false })),
    ]);
    const spent = resolvedSpent(agentState as any);
    const dayStart = (agentState as any).dayStart ?? 0;
    const nowSec = Math.floor(Date.now() / 1000);
    console.log(`[reset] agent[${idx}] ${candidate.slice(0, 8)}… approved=${check.approved} reason=${check.error ?? 'ok'} spent=${spent} dayStart=${dayStart} age=${nowSec - dayStart}s`);
    if (check.approved) {
      currentAgentIndex = idx;
      process.env.AGENT_ADDRESS = candidate;
      found = true;
      break;
    }
  }

  if (!found) {
    console.warn('[reset] all agents in pool have exceeded daily budget');
    return res.status(503).json({ error: 'All agents exhausted — wait for 24h window to reset' });
  }

  const agentAddr = process.env.AGENT_ADDRESS!;
  const state = await getAgentState(agentAddr).catch(() => ({ success: false }));
  console.log(`[reset] switched to agent[${currentAgentIndex}]: ${agentAddr}`);

  return res.json({
    success: true,
    currentAgent: agentAddr,
    agentIndex: currentAgentIndex,
    totalAgents: agentPool.length,
    cumulative24h: state.success ? ((state as any).cumulative24h ?? 0) : 0,
  });
});

app.listen(PORT, () => {
  console.log(`server running on http://localhost:${PORT}`);
});