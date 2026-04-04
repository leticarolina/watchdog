import {
  rpc,
  TransactionBuilder,
  Networks,
  Address,
  nativeToScVal,
  scValToNative,
  Contract,
  Account,
} from '@stellar/stellar-sdk';
import { Keypair } from '@stellar/stellar-sdk';

const CONTRACT_ID = 'CDVNQCBS26ATIJ7FBQZTPV4UDFLCM2TKZ4E77ONRXU4SN2BCNQRSRESC';
const RPC_URL = 'https://soroban-testnet.stellar.org';

// valid dummy source for simulation only
const DUMMY_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

const server = new rpc.Server(RPC_URL);
const contract = new Contract(CONTRACT_ID);

export async function getLimits(): Promise<{
  success: boolean;
  maxSinglePayment?: number;
  dailyBudget?: number;
  error?: string;
}> {
  try {
    const sourceAccount = new Account(DUMMY_SOURCE, '0');

    const operation = contract.call('get_limits');

    const tx = new TransactionBuilder(sourceAccount, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const result = await server.simulateTransaction(tx);

    if (!rpc.Api.isSimulationSuccess(result)) {
      return { success: false, error: 'FailedToReadLimits' };
    }

    const retval = result.result?.retval;

    if (!retval) {
      return { success: false, error: 'MissingReturnValue' };
    }

    const [maxSinglePayment, dailyBudget] = scValToNative(retval) as [string, string];

    return {
      success: true,
      maxSinglePayment: Number(maxSinglePayment),
      dailyBudget: Number(dailyBudget),
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function checkPayment(
  agent: string,
  amount: number,
): Promise<{ approved: boolean; error?: string }> {
  const sourceAccount = new Account(DUMMY_SOURCE, '0');

  const operation = contract.call(
    'request_payment',
    Address.fromString(agent).toScVal(),
    nativeToScVal(BigInt(amount), { type: 'i128' }),
  );

  const tx = new TransactionBuilder(sourceAccount, {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  const result = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationSuccess(result)) {
    return { approved: true };
  }

  if (rpc.Api.isSimulationError(result)) {
    const err = result.error;

    if (err.includes('Error(Contract, #1)')) {
      return { approved: false, error: 'SinglePaymentLimitExceeded' };
    }

    if (err.includes('Error(Contract, #2)')) {
      return { approved: false, error: 'DailyBudgetExceeded' };
    }

    return { approved: false, error: `ContractError: ${err.split('\n')[0]}` };
  }

  return { approved: false, error: 'SimulationFailed' };
}

export async function executePayment(
  agent: string,
  amount: number,
): Promise<{ success: boolean; hash?: string; error?: string }> {
  try {
    const secretKey = process.env.STELLAR_SECRET_KEY;

    if (!secretKey) {
      return { success: false, error: 'Missing STELLAR_SECRET_KEY' };
    }

    const keypair = Keypair.fromSecret(secretKey);
    const account = await server.getAccount(keypair.publicKey());

    const operation = contract.call(
      'request_payment',
      Address.fromString(agent).toScVal(),
      nativeToScVal(BigInt(amount), { type: 'i128' }),
    );

    let tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(sim)) {
      return { success: false, error: sim.error };
    }

    tx = rpc.assembleTransaction(tx, sim).build();

    tx.sign(keypair);

    const res = await server.sendTransaction(tx);

    return {
      success: true,
      hash: res.hash,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}