import { Meteor } from 'meteor/meteor';
import '/imports/api/server/authConfig.js';
import '/imports/api/server/publications.js';

Meteor.startup(async () => {
  console.log('HPP Hub server started');
});
