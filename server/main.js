import { Meteor } from 'meteor/meteor';
import '/imports/api/server/authConfig.js';
import '/imports/api/server/publications.js';
import '/imports/api/server/chat.js';
import '/imports/api/server/admin.js';
import '/imports/api/server/apiKeys.js';
import '/imports/api/server/wallet.js';
import '/imports/api/server/userInit.js';

Meteor.startup(async () => {
  // Fail fast if required env vars are missing
  if (!process.env.API_KEY_ENCRYPTION_SECRET) {
    throw new Error('API_KEY_ENCRYPTION_SECRET environment variable is required. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }

  console.log('HPP Hub server started');
});
