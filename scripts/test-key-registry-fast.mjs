// Test with minimal wait between funding and createKey tx
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

async function testFastFlow() {
  const totalStart = performance.now();
  const timings = {};

  console.log('🧪 Testing FAST Key Registry Flow (parallel where possible)\n');

  const web3 = new Web3(RPC_URL);
  const faucet = web3.eth.accounts.privateKeyToAccount(FAUCET_PRIVATE_KEY);
  web3.eth.accounts.wallet.add(faucet);

  // Step 1: Create wallet + call Router API in parallel
  console.log('═══ Step 1: Create Wallet + Router API (parallel) ═══');
  let stepStart = performance.now();

  const ephemeralWallet = web3.eth.accounts.create();
  web3.eth.accounts.wallet.add(ephemeralWallet);
  const username = `fast-${Date.now()}`;

  // Start Router API call immediately (doesn't need wallet funded yet)
  const routerPromise = callRouterAPI('/consumers', 'POST', {
    username,
    application: 'hub',
    quota: 10,
    userAddress: ephemeralWallet.address
  });

  const result = await routerPromise;
  timings.walletAndRouter = performance.now() - stepStart;

  console.log('✅ Wallet:', ephemeralWallet.address);
  console.log('✅ Router response received');
  console.log('   keyHash:', result.onchain?.keyHash?.substring(0, 20) + '...');
  console.log(`   Time: ${timings.walletAndRouter.toFixed(0)}ms\n`);

  // Step 2: Fund wallet (must wait for this)
  console.log('═══ Step 2: Fund Wallet ═══');
  stepStart = performance.now();

  const fundAmount = web3.utils.toWei('0.002', 'ether');
  const transferGas = await web3.eth.estimateGas({
    from: faucet.address,
    to: ephemeralWallet.address,
    value: fundAmount
  });

  const fundTx = await web3.eth.sendTransaction({
    from: faucet.address,
    to: ephemeralWallet.address,
    value: fundAmount,
    gas: transferGas
  });

  timings.fundWallet = performance.now() - stepStart;
  console.log('✅ Funded! Tx:', fundTx.transactionHash.substring(0, 20) + '...');
  console.log(`   Time: ${timings.fundWallet.toFixed(0)}ms\n`);

  // Step 3: Submit createKey immediately after funding confirms
  console.log('═══ Step 3: createKey Transaction ═══');
  stepStart = performance.now();

  const contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
  const createTx = contract.methods.createKey(result.onchain.keyHash, result.onchain.signature);
  const gas = await createTx.estimateGas({ from: ephemeralWallet.address });

  const receipt = await createTx.send({
    from: ephemeralWallet.address,
    gas: gas.toString()
  });

  timings.createKeyTx = performance.now() - stepStart;
  console.log('✅ Key registered! Tx:', receipt.transactionHash.substring(0, 20) + '...');
  console.log(`   Time: ${timings.createKeyTx.toFixed(0)}ms\n`);

  // Step 4: Verify
  console.log('═══ Step 4: Verify ═══');
  stepStart = performance.now();

  const keyInfo = await contract.methods.isKeyValid(result.onchain.keyHash).call();
  timings.verify = performance.now() - stepStart;
  console.log('✅ Valid:', keyInfo.valid);
  console.log(`   Time: ${timings.verify.toFixed(0)}ms\n`);

  const totalTime = performance.now() - totalStart;

  console.log('═'.repeat(50));
  console.log('📊 TIMING SUMMARY (FAST FLOW)');
  console.log('═'.repeat(50));
  console.log(`1. Wallet + Router API: ${timings.walletAndRouter.toFixed(0).padStart(6)}ms`);
  console.log(`2. Fund wallet:         ${timings.fundWallet.toFixed(0).padStart(6)}ms`);
  console.log(`3. createKey tx:        ${timings.createKeyTx.toFixed(0).padStart(6)}ms`);
  console.log(`4. Verify:              ${timings.verify.toFixed(0).padStart(6)}ms`);
  console.log('─'.repeat(50));
  console.log(`   TOTAL:               ${totalTime.toFixed(0).padStart(6)}ms (${(totalTime/1000).toFixed(1)}s)`);
  console.log('═'.repeat(50));

  // Compare
  console.log('\n📈 vs Sequential: ~5.6s → ' + (totalTime/1000).toFixed(1) + 's');
}

testFastFlow().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
