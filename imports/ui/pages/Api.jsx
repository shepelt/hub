import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { Key, Plus, Trash2, Wallet, ExternalLink, DollarSign, Copy, Eye, EyeOff, Check, Loader2 } from 'lucide-react';
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

  // Revealed keys state: { keyId: fullKeyValue }
  const [revealedKeys, setRevealedKeys] = useState({});
  const [revealingKey, setRevealingKey] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

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
      setRevealedKeys((prev) => {
        const next = { ...prev };
        delete next[keyId];
        return next;
      });
      await loadKeys();
      await loadUsage();
    } catch (error) {
      console.error('Failed to delete API key:', error);
      alert(error.reason || 'Failed to delete API key');
    }
  };

  const handleRevealKey = async (keyId) => {
    if (revealedKeys[keyId]) {
      // Hide the key
      setRevealedKeys((prev) => {
        const next = { ...prev };
        delete next[keyId];
        return next;
      });
      return;
    }

    setRevealingKey(keyId);
    try {
      const result = await Meteor.callAsync('apiKeys.getKey', keyId);
      setRevealedKeys((prev) => ({ ...prev, [keyId]: result.key }));
    } catch (error) {
      console.error('Failed to reveal API key:', error);
      alert(error.reason || 'Failed to reveal API key');
    } finally {
      setRevealingKey(null);
    }
  };

  const handleCopyKey = async (keyId) => {
    let keyToCopy = revealedKeys[keyId];

    if (!keyToCopy) {
      // Fetch the key first
      try {
        const result = await Meteor.callAsync('apiKeys.getKey', keyId);
        keyToCopy = result.key;
      } catch (error) {
        console.error('Failed to get API key:', error);
        alert(error.reason || 'Failed to copy API key');
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(keyToCopy);
      setCopiedKey(keyId);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
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
        <div className="credit-card">
          <div className="credit-card-content">
            <DollarSign size={18} />
            <span className="credit-card-label">Remaining Balance</span>
            <span className="credit-card-value">${usage.remaining.toFixed(2)}</span>
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
              {keys.map((key) => {
                const isRevealed = !!revealedKeys[key._id];
                const isRevealing = revealingKey === key._id;
                const isCopied = copiedKey === key._id;

                return (
                  <tr key={key._id}>
                    <td className="key-name">{key.name}</td>
                    <td className="key-value-cell">
                      <div className={`key-value-display ${isRevealed ? 'revealed' : ''}`}>
                        <code>{isRevealed ? revealedKeys[key._id] : key.keySuffix}</code>
                      </div>
                    </td>
                    <td className="key-date">
                      {new Date(key.createdAt).toLocaleDateString()}
                    </td>
                    <td className="key-actions">
                      <button
                        className={`key-action-btn ${isRevealed ? 'active' : ''}`}
                        onClick={() => handleRevealKey(key._id)}
                        title={isRevealed ? 'Hide key' : 'Reveal key'}
                        disabled={isRevealing}
                      >
                        {isRevealing ? (
                          <Loader2 size={16} className="spinning" />
                        ) : isRevealed ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                      <button
                        className={`key-action-btn ${isCopied ? 'copied' : ''}`}
                        onClick={() => handleCopyKey(key._id)}
                        title={isCopied ? 'Copied!' : 'Copy key'}
                      >
                        {isCopied ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                      <button
                        className="key-action-btn danger"
                        onClick={() => setDeleteConfirmId(key._id)}
                        title="Delete key"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
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
