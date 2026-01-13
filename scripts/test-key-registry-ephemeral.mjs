// Test full flow with ephemeral wallet funded from faucet
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

// Config
const RPC_URL = 'https://sepolia.hpp.io';
const CONTRACT_ADDRESS = '0x35f395b7554041DB56923B9375f653C0DbA60412';
const ROUTER_ADMIN_URL = process.env.ROUTER_ADMIN_URL || 'http://localhost:8000/admin/api/admin';
const ROUTER_USERNAME = settings.private.router.adminUsername;
const ROUTER_PASSWORD = settings.private.router.adminPassword;

// Faucet wallet from .env
const FAUCET_PRIVATE_KEY = process.env.KEY_REGISTRY_TEST_PRIVATE_KEY;

if (!FAUCET_PRIVATE_KEY) {
  console.error('❌ KEY_REGISTRY_TEST_PRIVATE_KEY not set in .env');
  process.exit(1);
}

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
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Router API error: ${response.status} ${text}`);
  }
  return response.json();
}

async function testEphemeralWallet() {
  const totalStart = performance.now();
  const timings = {};

  console.log('🧪 Testing Key Registry with Ephemeral Wallet\n');

  const web3 = new Web3(RPC_URL);
  const faucet = web3.eth.accounts.privateKeyToAccount(FAUCET_PRIVATE_KEY);
  web3.eth.accounts.wallet.add(faucet);

  console.log('📍 Faucet:', faucet.address);
  const faucetBalance = await web3.eth.getBalance(faucet.address);
  console.log('💰 Faucet balance:', web3.utils.fromWei(faucetBalance, 'ether'), 'ETH\n');

  // === Step 1: Create ephemeral wallet ===
  console.log('═══ Step 1: Create Ephemeral Wallet ═══');
  let stepStart = performance.now();

  const ephemeralWallet = web3.eth.accounts.create();
  web3.eth.accounts.wallet.add(ephemeralWallet);

  timings.createWallet = performance.now() - stepStart;
  console.log('✅ Created:', ephemeralWallet.address);
  console.log(`   Time: ${timings.createWallet.toFixed(0)}ms\n`);

  // === Step 2: Fund from faucet ===
  console.log('═══ Step 2: Fund from Faucet ═══');
  stepStart = performance.now();

  const fundAmount = web3.utils.toWei('0.005', 'ether'); // ~10 createKey txs worth
  console.log('📤 Sending', web3.utils.fromWei(fundAmount, 'ether'), 'ETH...');

  // Estimate gas for transfer
  const transferGas = await web3.eth.estimateGas({
    from: faucet.address,
    to: ephemeralWallet.address,
    value: fundAmount
  });
  console.log('   Estimated gas:', transferGas.toString());

  const fundTx = await web3.eth.sendTransaction({
    from: faucet.address,
    to: ephemeralWallet.address,
    value: fundAmount,
    gas: transferGas
  });

  timings.fundWallet = performance.now() - stepStart;
  console.log('✅ Funded!');
  console.log('   Tx:', fundTx.transactionHash);
  console.log(`   Time: ${timings.fundWallet.toFixed(0)}ms\n`);

  // === Step 3: Create consumer via Router API ===
  console.log('═══ Step 3: Create Consumer via Router API ═══');
  stepStart = performance.now();

  const username = `ephemeral-${Date.now()}`;
  const result = await callRouterAPI('/consumers', 'POST', {
    username,
    application: 'hub',
    quota: 10,
    userAddress: ephemeralWallet.address
  });

  timings.routerAPI = performance.now() - stepStart;
  console.log('✅ Consumer created!');
  console.log('   API Key:', result.api_key?.substring(0, 20) + '...');
  console.log('   keyHash:', result.onchain?.keyHash?.substring(0, 20) + '...');
  console.log(`   Time: ${timings.routerAPI.toFixed(0)}ms\n`);

  if (!result.onchain) {
    console.error('❌ No onchain data');
    process.exit(1);
  }

  // === Step 4: Submit createKey tx ===
  console.log('═══ Step 4: Submit createKey Transaction ═══');
  stepStart = performance.now();

  const contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
  const createTx = contract.methods.createKey(result.onchain.keyHash, result.onchain.signature);
  const gas = await createTx.estimateGas({ from: ephemeralWallet.address });

  const receipt = await createTx.send({
    from: ephemeralWallet.address,
    gas: gas.toString()
  });

  timings.createKeyTx = performance.now() - stepStart;
  console.log('✅ Key registered!');
  console.log('   Tx:', receipt.transactionHash);
  console.log('   Gas used:', receipt.gasUsed.toString());
  console.log(`   Time: ${timings.createKeyTx.toFixed(0)}ms\n`);

  // === Step 5: Verify ===
  console.log('═══ Step 5: Verify On-Chain ═══');
  stepStart = performance.now();

  const keyInfo = await contract.methods.isKeyValid(result.onchain.keyHash).call();

  timings.verify = performance.now() - stepStart;
  console.log('✅ Valid:', keyInfo.valid);
  console.log('   Owner:', keyInfo.keyOwner);
  console.log(`   Time: ${timings.verify.toFixed(0)}ms\n`);

  // === Summary ===
  const totalTime = performance.now() - totalStart;

  console.log('═'.repeat(50));
  console.log('📊 TIMING SUMMARY');
  console.log('═'.repeat(50));
  console.log(`1. Create wallet:     ${timings.createWallet.toFixed(0).padStart(6)}ms`);
  console.log(`2. Fund from faucet:  ${timings.fundWallet.toFixed(0).padStart(6)}ms`);
  console.log(`3. Router API call:   ${timings.routerAPI.toFixed(0).padStart(6)}ms`);
  console.log(`4. createKey tx:      ${timings.createKeyTx.toFixed(0).padStart(6)}ms`);
  console.log(`5. Verify on-chain:   ${timings.verify.toFixed(0).padStart(6)}ms`);
  console.log('─'.repeat(50));
  console.log(`   TOTAL:             ${totalTime.toFixed(0).padStart(6)}ms (${(totalTime/1000).toFixed(1)}s)`);
  console.log('═'.repeat(50));

  // Check remaining balance
  const remaining = await web3.eth.getBalance(ephemeralWallet.address);
  console.log('\n💰 Ephemeral wallet remaining:', web3.utils.fromWei(remaining, 'ether'), 'ETH');
  console.log('💸 Gas cost:', web3.utils.fromWei((BigInt(fundAmount) - BigInt(remaining)).toString(), 'ether'), 'ETH');
}

testEphemeralWallet().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
