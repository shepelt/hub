import { Meteor } from 'meteor/meteor';

// Server-side tests
if (Meteor.isServer) {
  import '../imports/api/server/utils.tests.js';
}
