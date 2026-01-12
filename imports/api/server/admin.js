import { Meteor } from 'meteor/meteor';
import { ApiKeys, Playgrounds, SystemSettings, DeletedAccounts } from '../collections.js';
import { RouterClient } from './routerClient.js';
import { normalizeEmail } from './utils.js';

const SETTINGS_ID = 'credits';

export async function isAdmin(userId) {
  if (!userId) return false;

  const adminEmails = Meteor.settings.private?.adminEmails || [];
  if (adminEmails.length === 0) return false;

  const user = await Meteor.users.findOneAsync({ _id: userId });
  const userEmail = user?.services?.google?.email;

  return userEmail && adminEmails.includes(userEmail);
}

Meteor.methods({
  'admin.isAdmin': async function() {
    return isAdmin(this.userId);
  },

  'admin.getSettings': async function() {
    if (!await isAdmin(this.userId)) {
      throw new Meteor.Error('not-authorized', 'Admin access required');
    }

    const settings = await SystemSettings.findOneAsync({ _id: SETTINGS_ID });
    return settings || { initialCredit: 10 };
  },

  'admin.updateSettings': async function({ initialCredit }) {
    if (!await isAdmin(this.userId)) {
      throw new Meteor.Error('not-authorized', 'Admin access required');
    }

    if (typeof initialCredit !== 'number' || initialCredit < 0) {
      throw new Meteor.Error('invalid-input', 'Initial credit must be a non-negative number');
    }

    await SystemSettings.upsertAsync(
      { _id: SETTINGS_ID },
      {
        $set: {
          initialCredit,
          updatedAt: new Date(),
          updatedBy: this.userId
        }
      }
    );

    return { success: true };
  },

  /**
   * Delete current user's account and all associated data
   * @param {string} confirmEmail - User must enter their email to confirm
   */
  'account.delete': async function(confirmEmail) {
    if (!this.userId) {
      throw new Meteor.Error('not-authenticated', 'Must be logged in');
    }

    const user = await Meteor.users.findOneAsync({ _id: this.userId });
    const userEmail = user?.services?.google?.email;

    if (!userEmail || confirmEmail !== userEmail) {
      throw new Meteor.Error('email-mismatch', 'Email does not match');
    }

    // Get consumer ID to delete from Router
    const apiKey = await ApiKeys.findOneAsync({ userId: this.userId });
    const consumerId = apiKey?.consumerId || user?.consumerId;

    // Save remaining credit before deletion (for restoration if user returns)
    if (consumerId && userEmail) {
      try {
        const consumer = await RouterClient.getConsumer(consumerId);
        const remainingCredit = (consumer.quota || 0) - (consumer.used || 0);

        await DeletedAccounts.upsertAsync(
          { _id: normalizeEmail(userEmail) },
          {
            $set: {
              lastCredit: Math.max(0, remainingCredit),
              deletedAt: new Date()
            }
          }
        );
        console.log(`📝 Saved remaining credit $${remainingCredit.toFixed(2)} for ${userEmail}`);
      } catch (error) {
        console.error(`❌ Failed to save credit before deletion: ${error.message}`);
      }
    }

    // Delete Router consumer (this also deletes all keys in Router)
    if (consumerId) {
      try {
        await RouterClient.deleteConsumer(consumerId);
        console.log(`✅ Deleted Router consumer ${consumerId}`);
      } catch (error) {
        console.error(`❌ Failed to delete Router consumer: ${error.message}`);
        // Continue with local deletion even if Router fails
      }
    }

    // Delete all user's API keys
    await ApiKeys.removeAsync({ userId: this.userId });

    // Delete all user's playgrounds
    await Playgrounds.removeAsync({ userId: this.userId });

    // Delete the user
    await Meteor.users.removeAsync({ _id: this.userId });

    console.log(`✅ Deleted account for user ${this.userId} (${userEmail})`);

    return { success: true };
  }
});
