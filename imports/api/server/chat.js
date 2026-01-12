import { Meteor } from 'meteor/meteor';
import fs from 'fs/promises';
import sigrid, { createWorkspace, openWorkspace } from 'sigrid';
import { Playgrounds, ApiKeys } from '../collections.js';
import { MeteorPersistence } from './MeteorPersistence.js';
import { getPrompt } from '../prompts.js';

/**
 * Get user's Playground API key
 */
async function getUserApiKey(userId) {
  const user = await Meteor.users.findOneAsync({ _id: userId });
  if (user?.playgroundApiKey) {
    return user.playgroundApiKey;
  }
  // Fallback to shared gateway key
  return Meteor.settings.private?.llmGateway?.apiKey;
}

/**
 * Get or create workspace for a playground
 * @param {string} workspacePath - Existing workspace path (from DB)
 */
async function getWorkspace(workspacePath) {
  if (workspacePath) {
    return openWorkspace(workspacePath);
  }
  // Create new workspace with optional custom base directory
  const baseDir = process.env.WORKSPACE_BASE_DIR;
  return createWorkspace(baseDir ? { baseDir } : undefined);
}

// Initialize sigrid client on module load
Meteor.startup(async () => {
  const gatewayConfig = Meteor.settings.private?.llmGateway;

  if (gatewayConfig?.enabled) {
    sigrid.initializeClient({
      apiKey: gatewayConfig.apiKey,
      baseURL: gatewayConfig.url
    });
    console.log('✅ Sigrid LLM client initialized with gateway');
  } else if (process.env.OPENAI_API_KEY) {
    sigrid.initializeClient(process.env.OPENAI_API_KEY);
    console.log('✅ Sigrid LLM client initialized with OpenAI');
  } else {
    console.warn('⚠️  No LLM configuration found');
  }

  // Clean up any stuck streaming playgrounds from server restarts
  const stuckCount = await Playgrounds.updateAsync(
    { status: { $in: ['streaming', 'thinking'] } },
    {
      $set: { status: 'idle' }
    },
    { multi: true }
  );

  // Also fix any stuck isStreaming messages
  await Playgrounds.updateAsync(
    { 'messages.isStreaming': true },
    {
      $set: { 'messages.$.isStreaming': false }
    },
    { multi: true }
  );

  if (stuckCount > 0) {
    console.log(`🔧 Cleaned up ${stuckCount} stuck playgrounds`);
  }
});

Meteor.methods({
  /**
   * Create a new playground
   */
  async 'playground.create'(model) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in');
    }

    const gatewayConfig = Meteor.settings.private?.llmGateway;
    const defaultModel = Meteor.settings.public?.defaultModel || gatewayConfig?.defaultModel || 'gpt-4o-mini';

    const playgroundId = await Playgrounds.insertAsync({
      userId: this.userId,
      title: 'New conversation',
      messages: [],
      model: model || defaultModel,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return playgroundId;
  },

  /**
   * Send a message to a playground (with streaming)
   */
  async 'playground.send'(playgroundId, message, requestedModel) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in');
    }

    // Verify ownership
    const playground = await Playgrounds.findOneAsync({
      _id: playgroundId,
      userId: this.userId
    });

    if (!playground) {
      throw new Meteor.Error('not-found', 'Playground not found');
    }

    const gatewayConfig = Meteor.settings.private?.llmGateway;
    const model = requestedModel || playground.model || gatewayConfig?.defaultModel || 'gpt-4o-mini';

    try {
      // Update model if it changed
      if (model !== playground.model) {
        await Playgrounds.updateAsync(playgroundId, { $set: { model } });
      }
      // Auto-generate title from first message
      if (playground.messages.length === 0) {
        const title = message.length > 50 ? message.substring(0, 50) + '...' : message;
        await Playgrounds.updateAsync(playgroundId, { $set: { title } });
      }

      // Add user message to UI immediately
      await Playgrounds.updateAsync(playgroundId, {
        $push: { messages: { role: 'user', content: message } },
        $set: { status: 'thinking', updatedAt: new Date() }
      });

      // Get current message count for indexing the assistant message
      const updatedPlayground = await Playgrounds.findOneAsync(playgroundId);
      const messageIndex = updatedPlayground.messages.length;

      // Add placeholder for assistant response
      await Playgrounds.updateAsync(playgroundId, {
        $push: { messages: { role: 'assistant', content: '', isStreaming: true } },
        $set: { status: 'streaming' }
      });

      let fullContent = '';
      let lastUpdate = 0;
      const UPDATE_INTERVAL = 100; // Update DB every 100ms

      // Get or create workspace for this playground
      const workspace = await getWorkspace(playground.workspacePath);

      // Save workspace path if newly created
      if (!playground.workspacePath) {
        await Playgrounds.updateAsync(playgroundId, {
          $set: { workspacePath: workspace.path }
        });
      }

      // Reinitialize sigrid with user's personal API key for quota tracking
      const userApiKey = await getUserApiKey(this.userId);
      const gatewayConfig = Meteor.settings.private?.llmGateway;
      if (userApiKey && gatewayConfig?.url) {
        sigrid.initializeClient({
          apiKey: userApiKey,
          baseURL: gatewayConfig.url
        });
      }

      // Use workspace.chat() with streaming
      const persistence = new MeteorPersistence(this.userId);
      const result = await workspace.chat(message, {
        model,
        conversation: true,
        conversationPersistence: persistence,
        conversationID: playgroundId,
        instruction: getPrompt('default'),
        includeWorkspace: false,
        stream: true,
        streamCallback: (chunk) => {
          fullContent += chunk;
          // Throttle DB updates to avoid overwhelming
          const now = Date.now();
          if (now - lastUpdate > UPDATE_INTERVAL) {
            lastUpdate = now;
            Playgrounds.updateAsync(
              { _id: playgroundId },
              { $set: { [`messages.${messageIndex}.content`]: fullContent } }
            );
          }
        },
        max_tokens: 4096
      });

      // Use fullContent if available, otherwise fall back to result.content
      const finalContent = fullContent || result.content || '';
      console.log(`Streaming complete: fullContent=${fullContent.length} chars, result.content=${result.content?.length || 0} chars`);

      // Finalize: mark streaming complete
      await Playgrounds.updateAsync(
        { _id: playgroundId },
        {
          $set: {
            [`messages.${messageIndex}.isStreaming`]: false,
            [`messages.${messageIndex}.content`]: finalContent,
            status: 'idle',
            updatedAt: new Date()
          }
        }
      );

      return {
        content: finalContent,
        model: model
      };
    } catch (error) {
      console.error('Playground error:', error);
      // Update status to error
      await Playgrounds.updateAsync(playgroundId, {
        $set: { status: 'error', updatedAt: new Date() }
      });
      throw new Meteor.Error('playground-error', error.message);
    }
  },

  /**
   * Rename a playground
   */
  async 'playground.rename'(playgroundId, title) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in');
    }

    const result = await Playgrounds.updateAsync(
      { _id: playgroundId, userId: this.userId },
      { $set: { title } }
    );

    if (result === 0) {
      throw new Meteor.Error('not-found', 'Playground not found');
    }

    return true;
  },

  /**
   * Update playground model
   */
  async 'playground.setModel'(playgroundId, model) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in');
    }

    const result = await Playgrounds.updateAsync(
      { _id: playgroundId, userId: this.userId },
      { $set: { model } }
    );

    if (result === 0) {
      throw new Meteor.Error('not-found', 'Playground not found');
    }

    return true;
  },

  /**
   * Delete a playground and its workspace
   */
  async 'playground.delete'(playgroundId) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in');
    }

    // Get playground to find workspace path
    const playground = await Playgrounds.findOneAsync({
      _id: playgroundId,
      userId: this.userId
    });

    if (!playground) {
      throw new Meteor.Error('not-found', 'Playground not found');
    }

    // Delete workspace directory if it exists
    if (playground.workspacePath) {
      try {
        await fs.rm(playground.workspacePath, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Failed to delete workspace: ${error.message}`);
      }
    }

    // Delete playground from DB
    await Playgrounds.removeAsync({ _id: playgroundId });

    return true;
  }
});
