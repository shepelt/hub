import { Meteor } from 'meteor/meteor';
import { ApiKeys, SystemSettings, WalletShares } from '../collections.js';
import { RouterClient } from './routerClient.js';
import { encrypt, decrypt } from './utils.js';

const DEFAULT_INITIAL_CREDIT = 10;
const APP_ID = 'hpp-hub';

async function getInitialCredit() {
  const settings = await SystemSettings.findOneAsync({ _id: 'credits' });
  return settings?.initialCredit ?? DEFAULT_INITIAL_CREDIT;
}

async function getUserConsumerId(userId) {
  // Check ApiKeys collection first
  const existingKey = await ApiKeys.findOneAsync({ userId });
  if (existingKey?.consumerId) {
    return existingKey.consumerId;
  }

  // Fallback: check user document (set during signup)
  const user = await Meteor.users.findOneAsync({ _id: userId });
  return user?.consumerId || null;
}

Meteor.methods({
  /**
   * Create a new API key for the current user
   * If user has no consumer yet, creates one with initial credit
   * @param {string} name - User-friendly key name
   * @returns {Promise<{keyId: string, key: string, name: string}>}
   */
  'apiKeys.create': async function(name) {
    if (!this.userId) {
      throw new Meteor.Error('not-authenticated', 'Must be logged in');
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Meteor.Error('invalid-name', 'Key name is required');
    }

    let consumerId = await getUserConsumerId(this.userId);
    let fullKey;

    if (!consumerId) {
      // First key - create consumer with initial credit
      const initialCredit = await getInitialCredit();

      // Get user's wallet address if they have one
      const wallet = await WalletShares.findOneAsync({ userId: this.userId });
      const userAddress = wallet?.address || null;

      const result = await RouterClient.createConsumer(
        this.userId,
        APP_ID,
        initialCredit,
        'hub',
        userAddress
      );
      // Router returns { consumer: { id, username }, api_key, quota, onchain? }
      consumerId = result.consumer.id;
      fullKey = result.api_key;

      // Store the first key (with encrypted full key for retrieval)
      const keySuffix = fullKey.slice(-4);
      await ApiKeys.insertAsync({
        userId: this.userId,
        consumerId,
        keyId: 'initial', // Router doesn't return key_id for first key
        name: name.trim(),
        keySuffix: `...${keySuffix}`,
        encryptedKey: encrypt(fullKey),
        createdAt: new Date()
      });

      return {
        keyId: 'initial',
        key: fullKey,
        name: name.trim(),
        onchain: result.onchain || null  // For on-chain registration
      };
    }

    // Existing consumer - add new key
    // Get user's wallet address if they have one
    const wallet = await WalletShares.findOneAsync({ userId: this.userId });
    const userAddress = wallet?.address || null;

    const result = await RouterClient.createKey(consumerId, 'hpph', userAddress);
    fullKey = result.key;
    const keySuffix = fullKey.slice(-4);

    await ApiKeys.insertAsync({
      userId: this.userId,
      consumerId,
      keyId: result.id,
      name: name.trim(),
      keySuffix: `...${keySuffix}`,
      encryptedKey: encrypt(fullKey),
      createdAt: new Date()
    });

    return {
      keyId: result.id,
      key: fullKey,
      name: name.trim(),
      onchain: result.onchain || null  // For on-chain registration
    };
  },

  /**
   * List all API keys for the current user (excludes hidden Default key)
   * @returns {Promise<Array<{_id, name, keySuffix, createdAt}>>}
   */
  'apiKeys.list': async function() {
    if (!this.userId) {
      throw new Meteor.Error('not-authenticated', 'Must be logged in');
    }

    // Exclude the Playground key - it's hidden and used internally
    return ApiKeys.find(
      { userId: this.userId, keyId: { $nin: ['initial', 'playground'] } },
      {
        fields: { _id: 1, name: 1, keySuffix: 1, createdAt: 1 },
        sort: { createdAt: -1 }
      }
    ).fetchAsync();
  },

  /**
   * Delete an API key
   * @param {string} keyId - Hub ApiKey document _id
   */
  'apiKeys.delete': async function(keyId) {
    if (!this.userId) {
      throw new Meteor.Error('not-authenticated', 'Must be logged in');
    }

    const apiKey = await ApiKeys.findOneAsync({
      _id: keyId,
      userId: this.userId
    });

    if (!apiKey) {
      throw new Meteor.Error('not-found', 'API key not found');
    }

    // Protect Playground key from deletion
    if (apiKey.keyId === 'initial' || apiKey.keyId === 'playground') {
      throw new Meteor.Error('protected', 'Cannot delete the Playground API key');
    }

    // Check if this is the last key (excluding Playground key)
    const keyCount = await ApiKeys.find({ userId: this.userId }).countAsync();

    if (keyCount === 1) {
      // Last key - delete the consumer entirely
      await RouterClient.deleteConsumer(apiKey.consumerId);
    } else {
      // Delete just the key
      await RouterClient.deleteKey(apiKey.consumerId, apiKey.keyId);
    }

    await ApiKeys.removeAsync({ _id: keyId });

    return { success: true };
  },

  /**
   * Get quota and usage for current user
   * @returns {Promise<{quota: number, used: number, remaining: number, requests: number} | null>}
   */
  'apiKeys.getUsage': async function() {
    if (!this.userId) {
      throw new Meteor.Error('not-authenticated', 'Must be logged in');
    }

    const consumerId = await getUserConsumerId(this.userId);
    if (!consumerId) {
      return null; // No consumer yet
    }

    const consumer = await RouterClient.getConsumer(consumerId);
    return {
      quota: consumer.quota,
      used: consumer.used,
      remaining: consumer.quota - consumer.used,
      requests: consumer.requests
    };
  },

  /**
   * Rename an API key
   * @param {string} keyId - Hub ApiKey document _id
   * @param {string} name - New name
   */
  'apiKeys.rename': async function(keyId, name) {
    if (!this.userId) {
      throw new Meteor.Error('not-authenticated', 'Must be logged in');
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Meteor.Error('invalid-name', 'Key name is required');
    }

    const result = await ApiKeys.updateAsync(
      { _id: keyId, userId: this.userId },
      { $set: { name: name.trim() } }
    );

    if (result === 0) {
      throw new Meteor.Error('not-found', 'API key not found');
    }

    return { success: true };
  },

  /**
   * Retrieve the full API key (decrypted)
   * @param {string} keyId - Hub ApiKey document _id
   * @returns {Promise<{key: string}>}
   */
  'apiKeys.getKey': async function(keyId) {
    if (!this.userId) {
      throw new Meteor.Error('not-authenticated', 'Must be logged in');
    }

    const apiKey = await ApiKeys.findOneAsync({
      _id: keyId,
      userId: this.userId
    });

    if (!apiKey) {
      throw new Meteor.Error('not-found', 'API key not found');
    }

    if (!apiKey.encryptedKey) {
      throw new Meteor.Error('not-available', 'This key was created before key retrieval was enabled. Please create a new key.');
    }

    return { key: decrypt(apiKey.encryptedKey) };
  }
});
