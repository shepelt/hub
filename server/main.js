import { Meteor } from 'meteor/meteor';
import '/imports/api/server/authConfig.js';
import '/imports/api/server/publications.js';
import '/imports/api/server/chat.js';
import '/imports/api/server/admin.js';
import '/imports/api/server/apiKeys.js';

Meteor.startup(async () => {
  console.log('HPP Hub server started');
});
