import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { Key, Plus, Trash2, Copy, Check, Eye, EyeOff } from 'lucide-react';

export const Api = () => {
  const [keys, setKeys] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState(null);
  const [copiedKeyId, setCopiedKeyId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const loadKeys = async () => {
    try {
      const result = await Meteor.callAsync('apiKeys.list');
      setKeys(result);
    } catch (error) {
      console.error('Failed to load API keys:', error);
    }
  };

  const loadUsage = async () => {
    try {
      const result = await Meteor.callAsync('apiKeys.getUsage');
      setUsage(result);
    } catch (error) {
      console.error('Failed to load usage:', error);
    }
  };

  useEffect(() => {
    Promise.all([loadKeys(), loadUsage()]).finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    setCreating(true);
    try {
      const result = await Meteor.callAsync('apiKeys.create', newKeyName.trim());
      setNewlyCreatedKey(result);
      setNewKeyName('');
      setShowCreateForm(false);
      await loadKeys();
      await loadUsage();
    } catch (error) {
      console.error('Failed to create API key:', error);
      alert(error.reason || 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (keyId) => {
    try {
      await Meteor.callAsync('apiKeys.delete', keyId);
      setDeleteConfirmId(null);
      await loadKeys();
      await loadUsage();
    } catch (error) {
      console.error('Failed to delete API key:', error);
      alert(error.reason || 'Failed to delete API key');
    }
  };

  const copyToClipboard = async (text, keyId) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKeyId(keyId);
      setTimeout(() => setCopiedKeyId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (loading) {
    return (
      <div className="api-keys-page">
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="api-keys-page">
      <div className="api-keys-header">
        <div>
          <h1>API Keys</h1>
          <p className="api-keys-subtitle">
            Manage your API keys for accessing HPP Router services
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateForm(true)}
          disabled={showCreateForm}
        >
          <Plus size={18} />
          Create New Key
        </button>
      </div>

      {usage && (
        <div className="usage-card">
          <h3>Usage & Quota</h3>
          <div className="usage-stats">
            <div className="usage-stat">
              <span className="usage-label">Quota</span>
              <span className="usage-value">${usage.quota.toFixed(2)}</span>
            </div>
            <div className="usage-stat">
              <span className="usage-label">Used</span>
              <span className="usage-value">${usage.used.toFixed(4)}</span>
            </div>
            <div className="usage-stat">
              <span className="usage-label">Remaining</span>
              <span className="usage-value">${usage.remaining.toFixed(4)}</span>
            </div>
            <div className="usage-stat">
              <span className="usage-label">Requests</span>
              <span className="usage-value">{usage.requests.toLocaleString()}</span>
            </div>
          </div>
          <div className="usage-bar">
            <div
              className="usage-bar-fill"
              style={{ width: `${Math.min((usage.used / usage.quota) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {newlyCreatedKey && (
        <div className="new-key-banner">
          <div className="new-key-header">
            <Key size={20} />
            <strong>New API Key Created: {newlyCreatedKey.name}</strong>
          </div>
          <p className="new-key-warning">
            Copy your API key now. You won't be able to see it again!
          </p>
          <div className="new-key-value">
            <code>{newlyCreatedKey.key}</code>
            <button
              className="btn btn-icon"
              onClick={() => copyToClipboard(newlyCreatedKey.key, 'new')}
            >
              {copiedKeyId === 'new' ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => setNewlyCreatedKey(null)}
          >
            I've saved my key
          </button>
        </div>
      )}

      {showCreateForm && (
        <div className="create-key-form">
          <h3>Create New API Key</h3>
          <form onSubmit={handleCreate}>
            <input
              type="text"
              placeholder="Key name (e.g., Production, Development)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              autoFocus
            />
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewKeyName('');
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={creating || !newKeyName.trim()}
              >
                {creating ? 'Creating...' : 'Create Key'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="api-keys-list">
        <h3>Your API Keys</h3>
        {keys.length === 0 ? (
          <div className="empty-state">
            <Key size={48} />
            <p>No API keys yet</p>
            <p className="empty-state-hint">
              Create your first API key to start using HPP Router services
            </p>
          </div>
        ) : (
          <table className="api-keys-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key._id}>
                  <td className="key-name">{key.name}</td>
                  <td className="key-suffix">
                    <code>{key.keySuffix}</code>
                  </td>
                  <td className="key-date">
                    {new Date(key.createdAt).toLocaleDateString()}
                  </td>
                  <td className="key-actions">
                    <button
                      className="btn btn-icon btn-danger"
                      onClick={() => setDeleteConfirmId(key._id)}
                      title="Delete key"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {deleteConfirmId && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete API Key?</h3>
            <p>
              This will permanently revoke this API key. Any applications using
              this key will no longer be able to authenticate.
            </p>
            <div className="modal-actions">
              <button
                className="modal-btn cancel"
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </button>
              <button
                className="modal-btn danger"
                onClick={() => handleDelete(deleteConfirmId)}
              >
                Delete Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
