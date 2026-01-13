// Test sending funding + createKey in rapid succession (same block)
import { Web3 } from 'web3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '..', '.env') });

const settingsPath = path.join(__dirname, '..', 'settings-local.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

const RPC_URL = 'https://sepolia.hpp.io';
const CONTRACT_ADDRESS = '0x35f395b7554041DB56923B9375f653C0DbA60412';
const ROUTER_ADMIN_URL = process.env.ROUTER_ADMIN_URL || 'http://localhost:8000/admin/api/admin';
const ROUTER_USERNAME = settings.private.router.adminUsername;
const ROUTER_PASSWORD = settings.private.router.adminPassword;
const FAUCET_PRIVATE_KEY = process.env.KEY_REGISTRY_TEST_PRIVATE_KEY;

const CONTRACT_ABI = [
  {
    inputs: [
      { name: 'keyHash', type: 'bytes32' },
      { name: 'hubSignature', type: 'bytes' }
    ],
    name: 'createKey',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'keyHash', type: 'bytes32' }],
    name: 'isKeyValid',
    outputs: [
      { name: 'valid', type: 'bool' },
      { name: 'keyOwner', type: 'address' }
    ],
    stateMutability: 'view',
    type: 'function'
  }
];

async function callRouterAPI(endpoint, method = 'GET', body = null) {
  const url = `${ROUTER_ADMIN_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Basic ' + Buffer.from(`${ROUTER_USERNAME}:${ROUTER_PASSWORD}`).toString('base64')
  };
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Router API error: ${response.status}`);
  return response.json();
}

async function testParallelTxs() {
  const totalStart = performance.now();

  console.log('🧪 Testing PARALLEL Tx Flow (funding + createKey same block)\n');

  const web3 = new Web3(RPC_URL);
  const faucet = web3.eth.accounts.privateKeyToAccount(FAUCET_PRIVATE_KEY);
  web3.eth.accounts.wallet.add(faucet);

  // Create ephemeral wallet
  const ephemeralWallet = web3.eth.accounts.create();
  web3.eth.accounts.wallet.add(ephemeralWallet);
  console.log('📍 Faucet:', faucet.address);
  console.log('📍 Ephemeral:', ephemeralWallet.address);

  // Get Router response first
  console.log('\n═══ Step 1: Router API ═══');
  let stepStart = performance.now();

  const username = `parallel-${Date.now()}`;
  const result = await callRouterAPI('/consumers', 'POST', {
    username,
    application: 'hub',
    quota: 10,
    userAddress: ephemeralWallet.address
  });

  const routerTime = performance.now() - stepStart;
  console.log('✅ Router response:', routerTime.toFixed(0) + 'ms');
  console.log('   keyHash:', result.onchain?.keyHash?.substring(0, 20) + '...');

  // Prepare both transactions
  console.log('\n═══ Step 2: Prepare Both Txs ═══');
  stepStart = performance.now();

  const fundAmount = web3.utils.toWei('0.002', 'ether');

  // Get nonces
  const faucetNonce = await web3.eth.getTransactionCount(faucet.address, 'pending');

  // Estimate gas for both
  const fundGas = await web3.eth.estimateGas({
    from: faucet.address,
    to: ephemeralWallet.address,
    value: fundAmount
  });

  const contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);

  // For createKey gas estimation, we need to fake having funds
  // Just use a fixed estimate based on previous runs
  const createKeyGas = 460000n; // ~388k used + buffer

  const prepTime = performance.now() - stepStart;
  console.log('✅ Prepared in', prepTime.toFixed(0) + 'ms');
  console.log('   Fund gas:', fundGas.toString());
  console.log('   createKey gas:', createKeyGas.toString());

  // Send both transactions in rapid succession
  console.log('\n═══ Step 3: Send Both Txs (no wait) ═══');
  stepStart = performance.now();

  // Send funding tx first (don't await)
  const fundTxPromise = web3.eth.sendTransaction({
    from: faucet.address,
    to: ephemeralWallet.address,
    value: fundAmount,
    gas: fundGas,
    nonce: faucetNonce
  });

  console.log('📤 Funding tx sent...');

  // Tiny delay to ensure funding tx hits mempool first
  await new Promise(r => setTimeout(r, 100));

  // Send createKey tx (don't await yet)
  const createTx = contract.methods.createKey(result.onchain.keyHash, result.onchain.signature);
  const createKeyTxPromise = createTx.send({
    from: ephemeralWallet.address,
    gas: createKeyGas.toString(),
    nonce: 0  // First tx from this wallet
  });

  console.log('📤 createKey tx sent...');

  const sendTime = performance.now() - stepStart;
  console.log('✅ Both sent in', sendTime.toFixed(0) + 'ms');

  // Now wait for both to confirm
  console.log('\n═══ Step 4: Wait for Confirmations ═══');
  stepStart = performance.now();

  try {
    const [fundReceipt, createReceipt] = await Promise.all([
      fundTxPromise,
      createKeyTxPromise
    ]);

    const confirmTime = performance.now() - stepStart;
    console.log('✅ Both confirmed in', confirmTime.toFixed(0) + 'ms');
    console.log('   Fund block:', fundReceipt.blockNumber.toString());
    console.log('   createKey block:', createReceipt.blockNumber.toString());
    console.log('   Same block?', fundReceipt.blockNumber === createReceipt.blockNumber ? '✅ YES' : '❌ NO');

    // Verify
    console.log('\n═══ Step 5: Verify ═══');
    const keyInfo = await contract.methods.isKeyValid(result.onchain.keyHash).call();
    console.log('✅ Valid:', keyInfo.valid);

    const totalTime = performance.now() - totalStart;
    console.log('\n═'.repeat(50));
    console.log('📊 TIMING SUMMARY (PARALLEL)');
    console.log('═'.repeat(50));
    console.log(`   Router API:      ${routerTime.toFixed(0).padStart(6)}ms`);
    console.log(`   Prepare txs:     ${prepTime.toFixed(0).padStart(6)}ms`);
    console.log(`   Send both:       ${sendTime.toFixed(0).padStart(6)}ms`);
    console.log(`   Confirmations:   ${confirmTime.toFixed(0).padStart(6)}ms`);
    console.log('─'.repeat(50));
    console.log(`   TOTAL:           ${totalTime.toFixed(0).padStart(6)}ms (${(totalTime/1000).toFixed(1)}s)`);
    console.log('═'.repeat(50));

  } catch (error) {
    console.error('❌ Transaction failed:', error.message);
    console.log('\n⚠️  Parallel execution may not work on this chain.');
    console.log('   Falling back to sequential would be needed.');
  }
}

testParallelTxs().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
