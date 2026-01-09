import { Playgrounds } from '../collections.js';

/**
 * Meteor-based persistence provider for Sigrid
 * Implements the sigrid persistence interface (get, append, delete)
 * Stores LLM conversation history in llmHistory field (separate from UI messages)
 */
export class MeteorPersistence {
  constructor(userId) {
    this.userId = userId;
  }

  /**
   * Retrieve LLM history for a playground
   * @param {string} playgroundId - Playground document _id
   * @returns {Promise<Array|null>} Array of message objects, or null if not found
   */
  async get(playgroundId) {
    const playground = await Playgrounds.findOneAsync({
      _id: playgroundId,
      userId: this.userId
    });

    if (!playground || !playground.llmHistory || playground.llmHistory.length === 0) {
      return null;
    }

    return playground.llmHistory;
  }

  /**
   * Append a message to LLM history
   * @param {string} playgroundId - Playground document _id
   * @param {string} messageJson - JSON string of the message to append
   * @returns {Promise<void>}
   */
  async append(playgroundId, messageJson) {
    const message = JSON.parse(messageJson);

    // Skip empty assistant messages
    if (message.role === 'assistant') {
      const hasContent = message.content &&
        typeof message.content === 'string' &&
        message.content.trim().length > 0;

      if (!hasContent) {
        return;
      }
    }

    await Playgrounds.updateAsync(
      { _id: playgroundId, userId: this.userId },
      { $push: { llmHistory: message } }
    );
  }

  /**
   * Delete/clear a playground's LLM history
   * @param {string} playgroundId - Playground document _id
   * @returns {Promise<void>}
   */
  async delete(playgroundId) {
    await Playgrounds.updateAsync(
      { _id: playgroundId, userId: this.userId },
      { $set: { llmHistory: [] } }
    );
  }
}
