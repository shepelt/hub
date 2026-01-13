import { Meteor } from 'meteor/meteor';
import { ApiKeys, SystemSettings, DeletedAccounts, WalletShares } from '../collections.js';
import { RouterClient } from './routerClient.js';
import { createWallet, signCreateKeyTx } from './wallet.js';

const DEFAULT_INITIAL_CREDIT = 10;
const APP_ID = 'hpp-hub';

function normalizeEmail(email) {
  return email?.toLowerCase().trim();
}

async function getInitialCredit() {
  const settings = await SystemSettings.findOneAsync({ _id: 'credits' });
  return settings?.initialCredit ?? DEFAULT_INITIAL_CREDIT;
}

async function getCreditForUser(email) {
  const deletedAccount = await DeletedAccounts.findOneAsync({ _id: email });
  if (deletedAccount) {
    console.log(`🔄 Returning user detected (${email}), restoring credit: $${deletedAccount.lastCredit.toFixed(2)}`);
    return deletedAccount.lastCredit;
  }
  return getInitialCredit();
}

Meteor.methods({
  /**
   * Initialize user account on first login
   * Creates wallet, Router consumer, and playground API key
   * Returns deviceShare for client storage
   *
   * @returns {Promise<{deviceShare: string, address: string, needsInit: boolean}>}
   */
  async 'user.init'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const user = await Meteor.users.findOneAsync(this.userId);

    // Check if already initialized
    if (user.consumerId && user.playgroundApiKey) {
      // Already initialized - just check wallet
      const wallet = await WalletShares.findOneAsync({ userId: this.userId });
      if (wallet) {
        return { needsInit: false, address: wallet.address };
      }
    }

    console.log(`🚀 Initializing user ${this.userId}...`);

    // Step 1: Create wallet
    let walletResult;
    const existingWallet = await WalletShares.findOneAsync({ userId: this.userId });
    if (existingWallet) {
      // Wallet exists but consumer doesn't - recover wallet
      const { recoverWallet } = await import('./wallet.js');
      walletResult = await recoverWallet(this.userId);
    } else {
      walletResult = await createWallet(this.userId);
    }
    console.log(`   ✅ Wallet created: ${walletResult.address}`);

    // Step 2: Create Router consumer with wallet address
    const email = normalizeEmail(user.services?.google?.email);
    const credit = await getCreditForUser(email);

    const result = await RouterClient.createConsumer(
      this.userId,
      APP_ID,
      credit,
      'hub',
      walletResult.address  // Pass wallet address for on-chain data
    );

    const consumerId = result.consumer.id;
    const fullKey = result.api_key;
    const keySuffix = fullKey.slice(-4);

    // Step 3: Store playground API key
    await ApiKeys.insertAsync({
      userId: this.userId,
      consumerId,
      keyId: 'playground',
      name: 'Playground',
      keySuffix: `...${keySuffix}`,
      createdAt: new Date()
    });

    // Step 4: Update user document
    await Meteor.users.updateAsync(this.userId, {
      $set: {
        consumerId,
        playgroundApiKey: fullKey
      }
    });
    console.log(`   ✅ Router consumer created`);

    // Step 5: Register on-chain if we have onchain data
    let onchainResult = null;
    if (result.onchain) {
      try {
        const txResult = await signCreateKeyTx(this.userId, walletResult.deviceShare, result.onchain);
        console.log(`   ✅ Registered on-chain`);
        console.log(`      tx: ${txResult.txHash}`);
        console.log(`      block: ${txResult.blockNumber}`);
        if (txResult.funding?.funded) {
          console.log(`      funded: ${txResult.funding.amount} ETH`);
        }
        onchainResult = txResult;
      } catch (err) {
        console.error(`   ⚠️ On-chain registration failed:`, err.message);
        // Non-blocking
      }
    }

    console.log(`✅ User ${this.userId} initialized`);

    return {
      needsInit: true,
      deviceShare: walletResult.deviceShare,
      address: walletResult.address,
      onchain: onchainResult
    };
  },

  /**
   * Recover wallet (for existing users with missing deviceShare)
   * @returns {Promise<{deviceShare: string, address: string}>}
   */
  async 'user.recoverWallet'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const { recoverWallet } = await import('./wallet.js');
    return recoverWallet(this.userId);
  },

  /**
   * Initialize consumer only (wallet already created separately)
   * Used by onboarding UI for step-by-step progress
   *
   * @param {string} walletAddress - User's wallet address
   * @returns {Promise<{consumerId, onchain}>}
   */
  async 'user.initConsumer'(walletAddress) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const user = await Meteor.users.findOneAsync(this.userId);

    // Check if already has consumer
    if (user.consumerId) {
      return { consumerId: user.consumerId, onchain: null };
    }

    console.log(`🔑 Creating consumer for user ${this.userId}...`);

    const email = user.services?.google?.email?.toLowerCase().trim();
    const credit = await getCreditForUser(email);

    const result = await RouterClient.createConsumer(
      this.userId,
      APP_ID,
      credit,
      'hub',
      walletAddress
    );

    const consumerId = result.consumer.id;
    const fullKey = result.api_key;
    const keySuffix = fullKey.slice(-4);

    // Store playground API key
    await ApiKeys.insertAsync({
      userId: this.userId,
      consumerId,
      keyId: 'playground',
      name: 'Playground',
      keySuffix: `...${keySuffix}`,
      createdAt: new Date()
    });

    // Update user document
    await Meteor.users.updateAsync(this.userId, {
      $set: {
        consumerId,
        playgroundApiKey: fullKey
      }
    });

    console.log(`   ✅ Consumer created: ${consumerId}`);

    return {
      consumerId,
      onchain: result.onchain || null
    };
  },

  /**
   * Check if user needs onboarding
   * @returns {Promise<{needsOnboarding: boolean, hasWallet: boolean, hasConsumer: boolean}>}
   */
  async 'user.checkStatus'() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const user = await Meteor.users.findOneAsync(this.userId);
    const wallet = await WalletShares.findOneAsync({ userId: this.userId });

    return {
      needsOnboarding: !user.consumerId || !wallet,
      hasWallet: !!wallet,
      hasConsumer: !!user.consumerId,
      walletAddress: wallet?.address || null
    };
  }
});
