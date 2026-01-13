import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { Navigate } from 'react-router-dom';
import { Save, DollarSign, Fuel, ExternalLink, RefreshCw } from 'lucide-react';

export const Admin = () => {
  const [isAdmin, setIsAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    initialCredit: 10
  });
  const [message, setMessage] = useState(null);
  const [faucet, setFaucet] = useState(null);
  const [faucetLoading, setFaucetLoading] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const result = await Meteor.callAsync('admin.isAdmin');
        setIsAdmin(result);
        if (result) {
          await loadSettings();
          await loadFaucetStats();
        }
      } catch (error) {
        console.error('Failed to check admin status:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };
    checkAdmin();
  }, []);

  const loadSettings = async () => {
    try {
      const result = await Meteor.callAsync('admin.getSettings');
      if (result) {
        setSettings({
          initialCredit: result.initialCredit ?? 10
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadFaucetStats = async () => {
    setFaucetLoading(true);
    try {
      const result = await Meteor.callAsync('admin.getFaucetStats');
      setFaucet(result);
    } catch (error) {
      console.error('Failed to load faucet stats:', error);
    } finally {
      setFaucetLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await Meteor.callAsync('admin.updateSettings', settings);
      setMessage({ type: 'success', text: 'Settings saved successfully' });
    } catch (error) {
      console.error('Failed to save settings:', error);
      setMessage({ type: 'error', text: error.reason || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-page">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1>Admin Settings</h1>
          <p className="admin-subtitle">
            Configure system-wide settings for HPP Hub
          </p>
        </div>
      </div>

      {message && (
        <div className={`message-banner ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Faucet Monitoring */}
      <div className="admin-section">
        <h2>
          <Fuel size={20} />
          Gas Faucet
          <button
            className="btn-icon-small"
            onClick={loadFaucetStats}
            disabled={faucetLoading}
            title="Refresh"
          >
            <RefreshCw size={16} className={faucetLoading ? 'spinning' : ''} />
          </button>
        </h2>
        <p className="section-description">
          Sponsors gas fees for user on-chain registrations
        </p>

        {faucet?.configured ? (
          <div className="faucet-stats">
            <div className="faucet-stat">
              <span className="faucet-label">Address</span>
              <a
                href={`${faucet.explorerUrl}/address/${faucet.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="faucet-link"
              >
                <code>{faucet.address.slice(0, 10)}...{faucet.address.slice(-8)}</code>
                <ExternalLink size={12} />
              </a>
            </div>
            <div className="faucet-stat">
              <span className="faucet-label">Balance</span>
              <span className="faucet-value">{parseFloat(faucet.balance).toFixed(6)} ETH</span>
            </div>
            <div className="faucet-stat">
              <span className="faucet-label">Per User</span>
              <span className="faucet-value">{faucet.minBalanceEth} ETH</span>
            </div>
            <div className="faucet-stat">
              <span className="faucet-label">Users Can Fund</span>
              <span className={`faucet-value ${faucet.usersCanFund < 100 ? 'warning' : ''}`}>
                {faucet.usersCanFund.toLocaleString()}
              </span>
            </div>
          </div>
        ) : (
          <div className="faucet-not-configured">
            <p>Faucet not configured. Set FAUCET_PRIVATE_KEY environment variable.</p>
          </div>
        )}
      </div>

      <div className="admin-section">
        <h2>
          <DollarSign size={20} />
          Credit Settings
        </h2>
        <p className="section-description">
          Configure credit amounts for new users
        </p>

        <form onSubmit={handleSave} className="settings-form">
          <div className="form-group">
            <label htmlFor="initialCredit">
              Initial Credit (USD)
              <span className="label-hint">Credit given to new users on signup</span>
            </label>
            <input
              id="initialCredit"
              type="number"
              min="0"
              step="0.01"
              value={settings.initialCredit}
              onChange={(e) => setSettings({ ...settings, initialCredit: parseFloat(e.target.value) || 0 })}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving}
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      </div>
    </div>
  );
};
