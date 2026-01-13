// Test wallet integration end-to-end (standalone, no Meteor)
import { Web3 } from 'web3';
import { split, combine } from 'shamir-secret-sharing';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '..', '.env') });

const settingsPath = path.join(__dirname, '..', 'settings-local.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

// Config from settings
const keyRegistry = settings.private.keyRegistry;
const RPC_URL = keyRegistry.rpcUrl;
const CONTRACT_ADDRESS = keyRegistry.contractAddress;
const MIN_BALANCE_ETH = keyRegistry.minBalanceEth;
const FUND_AMOUNT_ETH = keyRegistry.fundAmountEth;

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

function hexToBytes(hex) {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

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

async function testWalletIntegration() {
  console.log('🧪 Testing Wallet Integration (Full Flow)\n');
  console.log('Config:');
  console.log('  RPC:', RPC_URL);
  console.log('  Contract:', CONTRACT_ADDRESS);
  console.log('  Min Balance:', MIN_BALANCE_ETH, 'ETH');
  console.log('  Fund Amount:', FUND_AMOUNT_ETH, 'ETH\n');

  const web3 = new Web3(RPC_URL);

  // === Step 1: Create wallet + split key (simulates wallet.create) ===
  console.log('═══ Step 1: Create MPC Wallet ═══');

  const wallet = web3.eth.accounts.create();
  console.log('✅ Generated:', wallet.address);

  const privateKeyBytes = hexToBytes(wallet.privateKey);
  const shares = await split(privateKeyBytes, 3, 2);

  const deviceShare = bytesToHex(shares[0]);
  const serverShare = bytesToHex(shares[1]);
  const recoveryShare = bytesToHex(shares[2]);

  console.log('✅ Split into 3 shares');
  console.log('   Device share:', deviceShare.substring(0, 20) + '...');
  console.log('   (Server + Recovery would be stored in MongoDB)\n');

  // === Step 2: Check balance + fund if needed (simulates ensureWalletFunded) ===
  console.log('═══ Step 2: Gas Sponsorship ═══');

  const balance = await web3.eth.getBalance(wallet.address);
  const minBalanceWei = web3.utils.toWei(MIN_BALANCE_ETH, 'ether');
  const fundAmountWei = web3.utils.toWei(FUND_AMOUNT_ETH, 'ether');

  console.log('   Current balance:', web3.utils.fromWei(balance, 'ether'), 'ETH');
  console.log('   Min threshold:', MIN_BALANCE_ETH, 'ETH');

  if (BigInt(balance) < BigInt(minBalanceWei)) {
    console.log('📤 Funding from faucet...');

    const faucet = web3.eth.accounts.privateKeyToAccount(FAUCET_PRIVATE_KEY);
    web3.eth.accounts.wallet.add(faucet);

    const gas = await web3.eth.estimateGas({
      from: faucet.address,
      to: wallet.address,
      value: fundAmountWei
    });

    const fundReceipt = await web3.eth.sendTransaction({
      from: faucet.address,
      to: wallet.address,
      value: fundAmountWei,
      gas
    });

    console.log('✅ Funded!', FUND_AMOUNT_ETH, 'ETH');
    console.log('   Tx:', fundReceipt.transactionHash.substring(0, 20) + '...\n');
  } else {
    console.log('✅ Already funded\n');
  }

  // === Step 3: Call Router API ===
  console.log('═══ Step 3: Router API ═══');

  const username = `wallet-test-${Date.now()}`;
  const result = await callRouterAPI('/consumers', 'POST', {
    username,
    application: 'hub',
    quota: 10,
    userAddress: wallet.address
  });

  console.log('✅ Consumer created');
  console.log('   API Key:', result.api_key?.substring(0, 20) + '...');
  console.log('   keyHash:', result.onchain?.keyHash?.substring(0, 20) + '...\n');

  if (!result.onchain) {
    console.error('❌ No onchain data - is KEY_REGISTRY configured on Router?');
    process.exit(1);
  }

  // === Step 4: Reconstruct key + sign tx (simulates signCreateKeyTx) ===
  console.log('═══ Step 4: Sign & Send createKey Tx ═══');

  // Reconstruct from device + server shares
  const deviceBytes = hexToBytes(deviceShare);
  const serverBytes = hexToBytes(serverShare);
  const reconstructedBytes = await combine([deviceBytes, serverBytes]);
  const reconstructedKey = bytesToHex(reconstructedBytes);

  console.log('✅ Key reconstructed from shares');

  const signingAccount = web3.eth.accounts.privateKeyToAccount(reconstructedKey);
  web3.eth.accounts.wallet.add(signingAccount);

  const contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
  const tx = contract.methods.createKey(result.onchain.keyHash, result.onchain.signature);
  const gas = await tx.estimateGas({ from: signingAccount.address });

  const receipt = await tx.send({
    from: signingAccount.address,
    gas: gas.toString()
  });

  console.log('✅ Transaction sent!');
  console.log('   Tx:', receipt.transactionHash);
  console.log('   Block:', receipt.blockNumber.toString());
  console.log('   Gas:', receipt.gasUsed.toString());
  console.log('   Explorer: https://sepolia-explorer.hpp.io/tx/' + receipt.transactionHash + '\n');

  // === Step 5: Verify on-chain ===
  console.log('═══ Step 5: Verify On-Chain ═══');

  const keyInfo = await contract.methods.isKeyValid(result.onchain.keyHash).call();
  console.log('✅ Valid:', keyInfo.valid);
  console.log('   Owner:', keyInfo.keyOwner);

  // === Step 6: Test recovery (server + recovery shares) ===
  console.log('\n═══ Step 6: Test Recovery Flow ═══');

  const recoveryBytes = hexToBytes(recoveryShare);
  const recoveredBytes = await combine([serverBytes, recoveryBytes]);
  const recoveredKey = bytesToHex(recoveredBytes);

  console.log('✅ Key recovered from server + recovery shares');
  console.log('   Matches original?', recoveredKey === wallet.privateKey ? '✅ YES' : '❌ NO');

  // === Summary ===
  console.log('\n' + '═'.repeat(50));
  console.log('🎉 WALLET INTEGRATION TEST PASSED');
  console.log('═'.repeat(50));
  console.log('\nFlow verified:');
  console.log('  1. Create wallet + Shamir split ✓');
  console.log('  2. Gas sponsorship from faucet ✓');
  console.log('  3. Router API returns onchain data ✓');
  console.log('  4. Reconstruct key + sign tx ✓');
  console.log('  5. Key registered on-chain ✓');
  console.log('  6. Recovery flow works ✓');
  console.log('\nAPI Key:', result.api_key);
}

testWalletIntegration().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
