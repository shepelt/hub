// Test Shamir Secret Sharing for MPC-style wallet
import { split, combine } from 'shamir-secret-sharing';
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

// Helper: hex string to Uint8Array
function hexToBytes(hex) {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Helper: Uint8Array to hex string
function bytesToHex(bytes) {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

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

async function testShamirWallet() {
  console.log('🔐 Testing Shamir Secret Sharing Wallet\n');

  const web3 = new Web3(RPC_URL);
  const faucet = web3.eth.accounts.privateKeyToAccount(FAUCET_PRIVATE_KEY);
  web3.eth.accounts.wallet.add(faucet);

  // === Step 1: Generate new wallet ===
  console.log('═══ Step 1: Generate Wallet ═══');
  let stepStart = performance.now();

  const newWallet = web3.eth.accounts.create();
  console.log('✅ Generated wallet:', newWallet.address);
  console.log('   Private key:', newWallet.privateKey.substring(0, 20) + '...');

  const genTime = performance.now() - stepStart;
  console.log(`   Time: ${genTime.toFixed(0)}ms\n`);

  // === Step 2: Split private key using Shamir ===
  console.log('═══ Step 2: Split Key (Shamir 2-of-3) ═══');
  stepStart = performance.now();

  const privateKeyBytes = hexToBytes(newWallet.privateKey);
  console.log('   Key bytes length:', privateKeyBytes.length);

  // Split into 3 shares, require 2 to reconstruct
  const shares = await split(privateKeyBytes, 3, 2);

  const splitTime = performance.now() - stepStart;
  console.log('✅ Split into 3 shares');
  console.log('   Share 1 (device):', bytesToHex(shares[0]).substring(0, 30) + '...');
  console.log('   Share 2 (server):', bytesToHex(shares[1]).substring(0, 30) + '...');
  console.log('   Share 3 (recovery):', bytesToHex(shares[2]).substring(0, 30) + '...');
  console.log(`   Time: ${splitTime.toFixed(0)}ms\n`);

  // Simulate storage
  const deviceShare = shares[0];  // Would be in localStorage/secure storage
  const serverShare = shares[1];  // Would be encrypted in DB
  const recoveryShare = shares[2]; // Would be with user as backup

  // Clear original key from memory (in real impl)
  // privateKeyBytes.fill(0);

  // === Step 3: Reconstruct key for signing ===
  console.log('═══ Step 3: Reconstruct Key (device + server shares) ═══');
  stepStart = performance.now();

  const reconstructedBytes = await combine([deviceShare, serverShare]);
  const reconstructedKey = bytesToHex(reconstructedBytes);

  const reconstructTime = performance.now() - stepStart;
  console.log('✅ Reconstructed key:', reconstructedKey.substring(0, 20) + '...');
  console.log('   Matches original?', reconstructedKey === newWallet.privateKey ? '✅ YES' : '❌ NO');
  console.log(`   Time: ${reconstructTime.toFixed(0)}ms\n`);

  // === Step 4: Test reconstruction with different share combinations ===
  console.log('═══ Step 4: Test Share Combinations ═══');

  // Device + Server
  const combo1 = await combine([deviceShare, serverShare]);
  console.log('   device + server:', bytesToHex(combo1) === newWallet.privateKey ? '✅' : '❌');

  // Device + Recovery
  const combo2 = await combine([deviceShare, recoveryShare]);
  console.log('   device + recovery:', bytesToHex(combo2) === newWallet.privateKey ? '✅' : '❌');

  // Server + Recovery
  const combo3 = await combine([serverShare, recoveryShare]);
  console.log('   server + recovery:', bytesToHex(combo3) === newWallet.privateKey ? '✅' : '❌');

  console.log('');

  // === Step 5: Fund and sign a real transaction ===
  console.log('═══ Step 5: Fund Wallet ═══');
  stepStart = performance.now();

  const fundAmount = web3.utils.toWei('0.002', 'ether');
  const transferGas = await web3.eth.estimateGas({
    from: faucet.address,
    to: newWallet.address,
    value: fundAmount
  });

  await web3.eth.sendTransaction({
    from: faucet.address,
    to: newWallet.address,
    value: fundAmount,
    gas: transferGas
  });

  const fundTime = performance.now() - stepStart;
  console.log('✅ Funded wallet');
  console.log(`   Time: ${fundTime.toFixed(0)}ms\n`);

  // === Step 6: Create API key and sign createKey tx ===
  console.log('═══ Step 6: Router API + Sign Transaction ═══');
  stepStart = performance.now();

  const username = `shamir-${Date.now()}`;
  const result = await callRouterAPI('/consumers', 'POST', {
    username,
    application: 'hub',
    quota: 10,
    userAddress: newWallet.address
  });

  console.log('✅ Router response received');

  // Reconstruct key from shares for signing
  const signingKeyBytes = await combine([deviceShare, serverShare]);
  const signingKey = bytesToHex(signingKeyBytes);

  // Create account from reconstructed key
  const signingAccount = web3.eth.accounts.privateKeyToAccount(signingKey);
  web3.eth.accounts.wallet.add(signingAccount);

  // Sign and send createKey tx
  const contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
  const createTx = contract.methods.createKey(result.onchain.keyHash, result.onchain.signature);
  const gas = await createTx.estimateGas({ from: signingAccount.address });

  const receipt = await createTx.send({
    from: signingAccount.address,
    gas: gas.toString()
  });

  const signTime = performance.now() - stepStart;
  console.log('✅ Transaction signed and sent!');
  console.log('   Tx:', receipt.transactionHash);
  console.log(`   Time: ${signTime.toFixed(0)}ms\n`);

  // === Step 7: Verify on-chain ===
  console.log('═══ Step 7: Verify On-Chain ═══');
  const keyInfo = await contract.methods.isKeyValid(result.onchain.keyHash).call();
  console.log('✅ Valid:', keyInfo.valid);
  console.log('   Owner:', keyInfo.keyOwner);

  // === Summary ===
  console.log('\n' + '═'.repeat(50));
  console.log('📊 SHAMIR WALLET SUMMARY');
  console.log('═'.repeat(50));
  console.log(`   Generate wallet:     ${genTime.toFixed(0).padStart(6)}ms`);
  console.log(`   Split key (SSS):     ${splitTime.toFixed(0).padStart(6)}ms`);
  console.log(`   Reconstruct key:     ${reconstructTime.toFixed(0).padStart(6)}ms`);
  console.log(`   Fund wallet:         ${fundTime.toFixed(0).padStart(6)}ms`);
  console.log(`   Sign + send tx:      ${signTime.toFixed(0).padStart(6)}ms`);
  console.log('─'.repeat(50));
  console.log('   SSS overhead:        ~' + (splitTime + reconstructTime).toFixed(0) + 'ms');
  console.log('═'.repeat(50));

  console.log('\n🔐 Security model:');
  console.log('   • Private key split into 3 shares');
  console.log('   • Need 2 shares to reconstruct');
  console.log('   • Device share: client localStorage');
  console.log('   • Server share: Hub DB (encrypted)');
  console.log('   • Recovery share: user backup');
  console.log('   • Key only exists in memory during signing');
}

testShamirWallet().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
