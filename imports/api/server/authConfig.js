import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { Random } from 'meteor/random';
import { ServiceConfiguration } from 'meteor/service-configuration';
import { ApiKeys, SystemSettings, DeletedAccounts } from '../collections.js';
import { RouterClient } from './routerClient.js';
import { normalizeEmail } from './utils.js';

const DEFAULT_INITIAL_CREDIT = 10;
const APP_ID = 'hpp-hub';

async function getInitialCredit() {
  const settings = await SystemSettings.findOneAsync({ _id: 'credits' });
  return settings?.initialCredit ?? DEFAULT_INITIAL_CREDIT;
}

async function getCreditForUser(email) {
  // Check if this is a returning user
  const deletedAccount = await DeletedAccounts.findOneAsync({ _id: email });
  if (deletedAccount) {
    console.log(`🔄 Returning user detected (${email}), restoring credit: $${deletedAccount.lastCredit.toFixed(2)}`);
    return deletedAccount.lastCredit;
  }
  // New user gets initial credit
  return getInitialCredit();
}

// Create Router consumer when a new user signs up
Accounts.onCreateUser(async (options, user) => {
  // Generate a predictable user ID so we can use it for consumer creation
  const userId = user._id || Random.id();
  user._id = userId;

  // Copy profile from options if provided
  if (options.profile) {
    user.profile = options.profile;
  }

  try {
    // Get credit for user (restored credit for returning users, initial credit for new)
    const email = normalizeEmail(user.services?.google?.email);
    const credit = await getCreditForUser(email);
    const result = await RouterClient.createConsumer(
      userId,
      APP_ID,
      credit
    );

    const consumerId = result.consumer.id;
    const fullKey = result.api_key;
    const keySuffix = fullKey.slice(-4);

    // Store the Playground API key (hidden, used internally)
    await ApiKeys.insertAsync({
      userId,
      consumerId,
      keyId: 'playground',
      name: 'Playground',
      keySuffix: `...${keySuffix}`,
      createdAt: new Date()
    });

    // Store consumer ID and Playground API key on user for quick lookup
    user.consumerId = consumerId;
    user.playgroundApiKey = fullKey;

    console.log(`✅ Created Router consumer for new user ${userId}`);
  } catch (error) {
    console.error(`❌ Failed to create Router consumer for user ${userId}:`, error.message);
    // Don't block user creation if Router fails - they can create keys manually
  }

  return user;
});

Meteor.startup(async () => {
  // Configure Google OAuth
  const googleConfig = Meteor.settings.private?.oauth?.google;

  if (googleConfig) {
    await ServiceConfiguration.configurations.upsertAsync(
      { service: 'google' },
      {
        $set: {
          clientId: Meteor.settings.public?.google?.clientId,
          secret: googleConfig.clientSecret,
          loginStyle: 'popup'
        }
      }
    );
    console.log('✅ Google OAuth configured');
  } else {
    console.warn('⚠️  Google OAuth credentials not found in settings');
  }
});
