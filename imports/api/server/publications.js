import { Meteor } from 'meteor/meteor';
import { Playgrounds } from '../collections.js';

// Publish user's playgrounds
Meteor.publish('playgrounds', function() {
  if (!this.userId) {
    return this.ready();
  }

  return Playgrounds.find(
    { userId: this.userId },
    {
      fields: { userId: 0 },  // Don't send userId to client
      sort: { updatedAt: -1 }
    }
  );
});

// Publish user data including Google OAuth fields
Meteor.publish('userData', function() {
  if (!this.userId) {
    return this.ready();
  }

  return Meteor.users.find(
    { _id: this.userId },
    {
      fields: {
        'services.google.email': 1,
        'services.google.name': 1,
        'services.google.picture': 1,
        'profile.name': 1,
        'emails': 1
      }
    }
  );
});
