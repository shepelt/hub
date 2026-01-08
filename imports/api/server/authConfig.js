import { Meteor } from 'meteor/meteor';
import { ServiceConfiguration } from 'meteor/service-configuration';

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
