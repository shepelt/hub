import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { Web3 } from 'web3';
import { split, combine } from 'shamir-secret-sharing';
import { WalletShares } from '../collections';

// Defaults (can be overridden in settings-local.json private.keyRegistry)
const DEFAULT_RPC_URL = 'https://sepolia.hpp.io';
const DEFAULT_CONTRACT_ADDRESS = '0x35f395b7554041DB56923B9375f653C0DbA60412';
const DEFAULT_MIN_BALANCE_ETH = '0.0005';  // Trigger funding below this
const DEFAULT_FUND_AMOUNT_ETH = '0.002';   // Amount to fund (~4 txs)

// Get config from settings or use defaults
function getConfig() {
  const settings = Meteor.settings?.private?.keyRegistry || {};
  const web3 = new Web3();
  return {
    rpcUrl: settings.rpcUrl || DEFAULT_RPC_URL,
    explorerUrl: settings.explorerUrl || null,
    contractAddress: settings.contractAddress || DEFAULT_CONTRACT_ADDRESS,
    minBalanceWei: web3.utils.toWei(settings.minBalanceEth || DEFAULT_MIN_BALANCE_ETH, 'ether'),
    fundAmountWei: web3.utils.toWei(settings.fundAmountEth || DEFAULT_FUND_AMOUNT_ETH, 'ether')
  };
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
  },
  {
    inputs: [{ name: 'keyHash', type: 'bytes32' }],
    name: 'revokeKey',
    outputs: [],
    stateMutability: 'nonpayable',
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

/**
 * Create a new MPC wallet for a user
 * Generates key, splits into 3 shares (2-of-3), stores server + recovery shares
 *
 * @param {string} userId - Meteor user ID
 * @returns {object} { address, deviceShare } - deviceShare must be stored client-side
 */
export async function createWallet(userId) {
  check(userId, String);

  // Check if user already has a wallet
  const existing = await WalletShares.findOneAsync({ userId });
  if (existing) {
    throw new Meteor.Error('wallet-exists', 'User already has a wallet');
  }

  const config = getConfig();
  const web3 = new Web3(config.rpcUrl);

  // Generate new wallet
  const wallet = web3.eth.accounts.create();
  const privateKeyBytes = hexToBytes(wallet.privateKey);

  // Split into 3 shares, need 2 to reconstruct
  const shares = await split(privateKeyBytes, 3, 2);

  const deviceShare = bytesToHex(shares[0]);
  const serverShare = bytesToHex(shares[1]);
  const recoveryShare = bytesToHex(shares[2]);

  // Store server + recovery shares in MongoDB
  await WalletShares.insertAsync({
    userId,
    address: wallet.address,
    serverShare,
    recoveryShare,  // TODO: move to Router for separation
    createdAt: new Date()
  });

  // Return address and device share (client must store deviceShare in localStorage)
  return {
    address: wallet.address,
    deviceShare  // IMPORTANT: Only returned once, never stored server-side
  };
}

/**
 * Get user's wallet address (public info only)
 */
export async function getWalletAddress(userId) {
  check(userId, String);

  const wallet = await WalletShares.findOneAsync({ userId }, { fields: { address: 1 } });
  return wallet?.address || null;
}

/**
 * Reconstruct private key from device share + server share
 * Key is only in memory, used for signing, then cleared
 *
 * @param {string} userId - Meteor user ID
 * @param {string} deviceShare - Hex-encoded device share from client
 * @returns {string} Private key (hex) - caller must clear after use
 */
export async function reconstructKey(userId, deviceShare) {
  check(userId, String);
  check(deviceShare, String);

  const wallet = await WalletShares.findOneAsync({ userId });
  if (!wallet) {
    throw new Meteor.Error('no-wallet', 'User does not have a wallet');
  }

  const deviceBytes = hexToBytes(deviceShare);
  const serverBytes = hexToBytes(wallet.serverShare);

  const reconstructedBytes = await combine([deviceBytes, serverBytes]);
  return bytesToHex(reconstructedBytes);
}

/**
 * Reconstruct private key using recovery share (for device loss)
 * Requires server share + recovery share (both stored in Hub)
 *
 * @param {string} userId - Meteor user ID
 * @returns {object} { privateKey, newDeviceShare } - new device share to store
 */
export async function recoverWallet(userId) {
  check(userId, String);

  const wallet = await WalletShares.findOneAsync({ userId });
  if (!wallet) {
    throw new Meteor.Error('no-wallet', 'User does not have a wallet');
  }

  const serverBytes = hexToBytes(wallet.serverShare);
  const recoveryBytes = hexToBytes(wallet.recoveryShare);

  // Reconstruct key from server + recovery
  const reconstructedBytes = await combine([serverBytes, recoveryBytes]);
  const privateKey = bytesToHex(reconstructedBytes);

  // Generate new shares for the reconstructed key
  const shares = await split(reconstructedBytes, 3, 2);

  const newDeviceShare = bytesToHex(shares[0]);
  const newServerShare = bytesToHex(shares[1]);
  const newRecoveryShare = bytesToHex(shares[2]);

  // Update stored shares
  await WalletShares.updateAsync({ userId }, {
    $set: {
      serverShare: newServerShare,
      recoveryShare: newRecoveryShare
    }
  });

  return {
    address: wallet.address,
    deviceShare: newDeviceShare  // Client must store this
  };
}

/**
 * Sign and send a createKey transaction for API key registration
 * Automatically funds wallet from faucet if needed (gas sponsorship)
 *
 * @param {string} userId - Meteor user ID
 * @param {string} deviceShare - Device share from client
 * @param {object} onchainData - { keyHash, signature } from Router
 * @returns {object} { txHash, blockNumber, funding }
 */
export async function signCreateKeyTx(userId, deviceShare, onchainData) {
  check(userId, String);
  check(deviceShare, String);
  check(onchainData, Match.ObjectIncluding({
    keyHash: String,
    signature: String,
    contractAddress: String
  }));

  const wallet = await WalletShares.findOneAsync({ userId });
  if (!wallet) {
    throw new Meteor.Error('no-wallet', 'User does not have a wallet');
  }

  // Fund wallet if needed (gas sponsorship)
  const funding = await ensureWalletFunded(wallet.address);

  // Reconstruct private key
  const privateKey = await reconstructKey(userId, deviceShare);

  try {
    const config = getConfig();
    const web3 = new Web3(config.rpcUrl);
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    web3.eth.accounts.wallet.add(account);

    const contract = new web3.eth.Contract(CONTRACT_ABI, config.contractAddress);
    const tx = contract.methods.createKey(onchainData.keyHash, onchainData.signature);

    const gas = await tx.estimateGas({ from: account.address });
    const receipt = await tx.send({
      from: account.address,
      gas: gas.toString()
    });

    return {
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber.toString(),
      explorerUrl: config.explorerUrl,
      funding  // { funded: bool, txHash?, amount? }
    };
  } finally {
    // Clear private key from memory (best effort)
    // In JS, can't truly guarantee memory clearing
  }
}

/**
 * Check wallet balance
 */
export async function getWalletBalance(userId) {
  check(userId, String);

  const wallet = await WalletShares.findOneAsync({ userId });
  if (!wallet) {
    return null;
  }

  const config = getConfig();
  const web3 = new Web3(config.rpcUrl);
  const balance = await web3.eth.getBalance(wallet.address);
  return web3.utils.fromWei(balance, 'ether');
}

/**
 * Fund user wallet from faucet if balance is low
 * Used for gas sponsorship before createKey tx
 *
 * @param {string} address - User's wallet address
 * @returns {object} { funded, txHash?, amount?, balance? }
 */
async function ensureWalletFunded(address) {
  const faucetPrivateKey = process.env.KEY_REGISTRY_TEST_PRIVATE_KEY;
  if (!faucetPrivateKey) {
    throw new Meteor.Error('no-faucet', 'Faucet wallet not configured');
  }

  const config = getConfig();
  const web3 = new Web3(config.rpcUrl);

  // Check current balance
  const balance = await web3.eth.getBalance(address);
  if (BigInt(balance) >= BigInt(config.minBalanceWei)) {
    return { funded: false, balance: web3.utils.fromWei(balance, 'ether') };
  }

  // Fund from faucet - send exactly minBalance (enough for ~1 tx)
  const fundAmount = config.minBalanceWei;

  // Fund from faucet
  const faucet = web3.eth.accounts.privateKeyToAccount(faucetPrivateKey);
  web3.eth.accounts.wallet.add(faucet);

  // Check faucet balance
  const faucetBalance = await web3.eth.getBalance(faucet.address);
  if (BigInt(faucetBalance) < BigInt(fundAmount)) {
    throw new Meteor.Error('faucet-empty', 'Faucet wallet needs refilling');
  }

  // Estimate gas for transfer
  const gas = await web3.eth.estimateGas({
    from: faucet.address,
    to: address,
    value: fundAmount
  });

  const receipt = await web3.eth.sendTransaction({
    from: faucet.address,
    to: address,
    value: fundAmount,
    gas
  });

  return {
    funded: true,
    txHash: receipt.transactionHash,
    amount: web3.utils.fromWei(fundAmount, 'ether')
  };
}

// Meteor methods for client access
Meteor.methods({
  'wallet.create'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }
    return createWallet(this.userId);
  },

  'wallet.getAddress'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }
    return getWalletAddress(this.userId);
  },

  'wallet.getBalance'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }
    return getWalletBalance(this.userId);
  },

  'wallet.recover'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }
    return recoverWallet(this.userId);
  },

  async 'wallet.signCreateKey'(deviceShare, onchainData) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }
    check(deviceShare, String);
    check(onchainData, Object);
    return signCreateKeyTx(this.userId, deviceShare, onchainData);
  }
});
