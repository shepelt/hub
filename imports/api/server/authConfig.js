import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { Random } from 'meteor/random';
import { ServiceConfiguration } from 'meteor/service-configuration';

// Simple user creation - just set up basic user document
// Wallet, consumer, and API keys are created at first login
Accounts.onCreateUser((options, user) => {
  // Generate a predictable user ID
  const userId = user._id || Random.id();
  user._id = userId;

  // Copy profile from options if provided
  if (options.profile) {
    user.profile = options.profile;
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
