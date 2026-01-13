import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { Key, Plus, Trash2, Wallet, ExternalLink } from 'lucide-react';
import { CreateKeyModal } from '../components/CreateKeyModal.jsx';

export const Api = () => {
  const [keys, setKeys] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Wallet state
  const [walletAddress, setWalletAddress] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);

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

  const loadWallet = async () => {
    try {
      const address = await Meteor.callAsync('wallet.getAddress');
      setWalletAddress(address);
    } catch (error) {
      console.error('Failed to load wallet:', error);
    }
  };

  useEffect(() => {
    Promise.all([loadKeys(), loadUsage(), loadWallet()]).finally(() => setLoading(false));
  }, []);

  const handleKeyCreated = async () => {
    setShowCreateModal(false);
    await Promise.all([loadKeys(), loadUsage(), loadWallet()]);
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
          onClick={() => setShowCreateModal(true)}
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

      {/* Wallet Card */}
      <div className="wallet-card">
        <div className="wallet-card-content">
          <Wallet size={18} />
          <span className="wallet-card-label">On-Chain Wallet</span>
          {walletAddress ? (
            Meteor.settings.public?.explorerUrl ? (
              <a
                href={`${Meteor.settings.public.explorerUrl}/address/${walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="wallet-link"
              >
                <code>{walletAddress.slice(0, 10)}...{walletAddress.slice(-8)}</code>
                <ExternalLink size={12} />
              </a>
            ) : (
              <code className="wallet-address">{walletAddress.slice(0, 10)}...{walletAddress.slice(-8)}</code>
            )
          ) : (
            <button
              className="btn btn-small btn-secondary"
              onClick={async () => {
                setWalletLoading(true);
                try {
                  const { address, deviceShare } = await Meteor.callAsync('wallet.create');
                  localStorage.setItem('walletDeviceShare', deviceShare);
                  setWalletAddress(address);
                } catch (err) {
                  console.error('Failed to create wallet:', err);
                  alert(err.reason || 'Failed to create wallet');
                } finally {
                  setWalletLoading(false);
                }
              }}
              disabled={walletLoading}
            >
              {walletLoading ? 'Creating...' : 'Create Wallet'}
            </button>
          )}
        </div>
      </div>

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

      {/* Create Key Modal */}
      {showCreateModal && (
        <CreateKeyModal
          walletAddress={walletAddress}
          onComplete={handleKeyCreated}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete API Key?</h2>
              <p>This will permanently revoke this API key.</p>
            </div>
            <div className="modal-body">
              <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
                Any applications using this key will no longer be able to authenticate.
              </p>
              <div className="modal-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => setDeleteConfirmId(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleDelete(deleteConfirmId)}
                >
                  Delete Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
