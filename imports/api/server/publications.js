import { Meteor } from 'meteor/meteor';

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
