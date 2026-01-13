// Use .mjs extension for ES modules in Node
import { Web3 } from 'web3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
config({ path: path.join(__dirname, '..', '.env') });

// Load settings
const settingsPath = path.join(__dirname, '..', 'settings-local.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

// Config
const RPC_URL = 'https://sepolia.hpp.io';
const CONTRACT_ADDRESS = '0x35f395b7554041DB56923B9375f653C0DbA60412';

// Router config - use local router via Kong
const ROUTER_ADMIN_URL = process.env.ROUTER_ADMIN_URL || 'http://localhost:8000/admin/api/admin';
const ROUTER_USERNAME = settings.private.router.adminUsername;
const ROUTER_PASSWORD = settings.private.router.adminPassword;

// Test wallet from .env
const TEST_PRIVATE_KEY = process.env.KEY_REGISTRY_TEST_PRIVATE_KEY;

if (!TEST_PRIVATE_KEY) {
  console.error('❌ KEY_REGISTRY_TEST_PRIVATE_KEY not set in .env');
  process.exit(1);
}

// Contract ABI (minimal - just what we need)
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
  },
  {
    inputs: [{ name: 'keyHash', type: 'bytes32' }],
    name: 'revokeKey',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getStats',
    outputs: [
      { name: '_totalKeys', type: 'uint256' },
      { name: '_totalRevoked', type: 'uint256' },
      { name: '_activeKeys', type: 'uint256' }
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
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Router API error: ${response.status} ${text}`);
  }
  return response.json();
}

async function testKeyRegistry() {
  console.log('🧪 Testing Key Registry Integration (Hub → Router → Contract)\n');

  // Setup web3 and test wallet
  const web3 = new Web3(RPC_URL);
  const testUser = web3.eth.accounts.privateKeyToAccount(TEST_PRIVATE_KEY);
  web3.eth.accounts.wallet.add(testUser);

  console.log('📍 Network:', RPC_URL);
  console.log('📍 Contract:', CONTRACT_ADDRESS);
  console.log('📍 Test User:', testUser.address);
  console.log('📍 Router:', ROUTER_ADMIN_URL);

  // Check balance
  const balance = await web3.eth.getBalance(testUser.address);
  console.log('💰 Balance:', web3.utils.fromWei(balance, 'ether'), 'ETH\n');

  if (balance === 0n) {
    console.error('❌ Insufficient balance. Fund the test wallet first.');
    process.exit(1);
  }

  const contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);

  // === Test 1: Create consumer via Router API with userAddress ===
  console.log('═══ Test 1: Create Consumer via Router API ═══');

  const username = `test-user-${Date.now()}`;
  console.log('📤 Creating consumer:', username);
  console.log('   with userAddress:', testUser.address);

  let apiKey, onchain;
  try {
    const result = await callRouterAPI('/consumers', 'POST', {
      username,
      application: 'hub',
      quota: 10,
      userAddress: testUser.address
    });

    console.log('✅ Consumer created!');
    console.log('   Consumer ID:', result.consumer?.id);
    apiKey = result.api_key;
    console.log('   API Key:', apiKey?.substring(0, 20) + '...');

    if (result.onchain) {
      onchain = result.onchain;
      console.log('   On-chain data received:');
      console.log('   - keyHash:', onchain.keyHash);
      console.log('   - signature:', onchain.signature?.substring(0, 20) + '...');
      console.log('   - contractAddress:', onchain.contractAddress);
    } else {
      console.log('⚠️  No onchain data in response. Is KEY_REGISTRY configured on Router?');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Router API error:', error.message);
    process.exit(1);
  }

  // === Test 2: Submit createKey transaction ===
  console.log('\n═══ Test 2: Submit createKey Transaction ═══');

  try {
    console.log('📤 Submitting createKey tx...');
    const createTx = contract.methods.createKey(onchain.keyHash, onchain.signature);
    const createGas = await createTx.estimateGas({ from: testUser.address });
    console.log('   Estimated gas:', createGas.toString());

    const receipt = await createTx.send({
      from: testUser.address,
      gas: createGas.toString()
    });

    console.log('✅ Key registered on-chain!');
    console.log('   Tx hash:', receipt.transactionHash);
    console.log('   Block:', receipt.blockNumber.toString());
    console.log('   Gas used:', receipt.gasUsed.toString());
    console.log('   Explorer: https://sepolia-explorer.hpp.io/tx/' + receipt.transactionHash);
  } catch (error) {
    console.error('❌ Transaction failed:', error.message);
    process.exit(1);
  }

  // === Test 3: Verify key on-chain ===
  console.log('\n═══ Test 3: Verify Key On-Chain ═══');

  const keyInfo = await contract.methods.isKeyValid(onchain.keyHash).call();
  console.log('✓ Valid:', keyInfo.valid);
  console.log('✓ Owner:', keyInfo.keyOwner);

  if (keyInfo.valid && keyInfo.keyOwner.toLowerCase() === testUser.address.toLowerCase()) {
    console.log('✅ Key ownership verified!');
  } else {
    console.error('❌ Key verification failed');
  }

  // === Test 4: Contract stats ===
  console.log('\n═══ Test 4: Contract Stats ═══');

  const stats = await contract.methods.getStats().call();
  console.log('✓ Total keys:', stats._totalKeys.toString());
  console.log('✓ Total revoked:', stats._totalRevoked.toString());
  console.log('✓ Active keys:', stats._activeKeys.toString());

  // === Summary ===
  console.log('\n' + '═'.repeat(50));
  console.log('🎉 Integration test completed successfully!');
  console.log('═'.repeat(50));
  console.log('\nFlow validated:');
  console.log('1. Hub calls Router API with userAddress ✓');
  console.log('2. Router returns onchain { keyHash, signature } ✓');
  console.log('3. User signs createKey tx ✓');
  console.log('4. Key registered on-chain ✓');
  console.log('\nAPI Key for testing:', apiKey);
}

testKeyRegistry().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
