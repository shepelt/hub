import { Meteor } from 'meteor/meteor';

function getRouterConfig() {
  const config = Meteor.settings.private?.router;
  if (!config) {
    throw new Meteor.Error('config-error', 'Router configuration not found in settings');
  }
  return config;
}

function getAuthHeader() {
  const { adminUsername, adminPassword } = getRouterConfig();
  const credentials = Buffer.from(`${adminUsername}:${adminPassword}`).toString('base64');
  return `Basic ${credentials}`;
}

async function routerFetch(path, options = {}) {
  const { adminUrl } = getRouterConfig();
  const url = `${adminUrl}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Meteor.Error('router-error', `Router API error: ${response.status} - ${error}`);
  }

  return response.json();
}

export const RouterClient = {
  /**
   * Create a new consumer with initial API key
   * @param {string} username - Hub user ID
   * @param {string} customId - Application identifier (e.g., "hpp-hub")
   * @param {number} quota - Initial quota in USD
   * @param {string} application - Application name for grouping (e.g., "hub")
   * @returns {Promise<{consumer_id: string, api_key: string}>}
   */
  async createConsumer(username, customId, quota, application) {
    return routerFetch('/consumers', {
      method: 'POST',
      body: JSON.stringify({ username, custom_id: customId, quota, application })
    });
  },

  /**
   * Get consumer details including quota/usage
   * @param {string} consumerId - Kong consumer UUID
   * @returns {Promise<{id, username, quota, used, requests}>}
   */
  async getConsumer(consumerId) {
    // Consumer details are at /api/consumers/:id (not /api/admin)
    const { adminUrl } = getRouterConfig();
    const url = adminUrl.replace('/admin/api/admin', '/admin/api') + `/consumers/${consumerId}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': getAuthHeader()
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Meteor.Error('router-error', `Router API error: ${response.status} - ${error}`);
    }

    return response.json();
  },

  /**
   * Set consumer quota
   * @param {string} consumerId - Kong consumer UUID
   * @param {number} quota - Quota in USD
   */
  async setConsumerQuota(consumerId, quota) {
    const { adminUrl } = getRouterConfig();
    const url = adminUrl.replace('/admin/api/admin', '/admin/api') + `/consumers/${consumerId}/quota`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ quota })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Meteor.Error('router-error', `Router API error: ${response.status} - ${error}`);
    }

    return response.json();
  },

  /**
   * Add a new API key to an existing consumer
   * @param {string} consumerId - Kong consumer UUID
   * @param {string} prefix - Optional key prefix (e.g., "hpph")
   * @returns {Promise<{id: string, key: string, consumer_id: string}>}
   */
  async createKey(consumerId, prefix = 'hpph') {
    return routerFetch(`/consumers/${consumerId}/keys`, {
      method: 'POST',
      body: JSON.stringify({ prefix })
    });
  },

  /**
   * List all API keys for a consumer (returns suffixes only)
   * @param {string} consumerId - Kong consumer UUID
   * @returns {Promise<{keys: Array<{id, key_suffix, created_at}>, total: number}>}
   */
  async listKeys(consumerId) {
    return routerFetch(`/consumers/${consumerId}/keys`);
  },

  /**
   * Delete an API key
   * @param {string} consumerId - Kong consumer UUID
   * @param {string} keyId - Kong key-auth credential ID
   */
  async deleteKey(consumerId, keyId) {
    return routerFetch(`/consumers/${consumerId}/keys/${keyId}`, {
      method: 'DELETE'
    });
  },

  /**
   * Delete a consumer entirely
   * @param {string} consumerId - Kong consumer UUID
   */
  async deleteConsumer(consumerId) {
    return routerFetch(`/consumers/${consumerId}`, {
      method: 'DELETE'
    });
  }
};
