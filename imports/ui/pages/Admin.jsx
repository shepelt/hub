import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { Navigate } from 'react-router-dom';
import { Save, DollarSign } from 'lucide-react';

export const Admin = () => {
  const [isAdmin, setIsAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    initialCredit: 10
  });
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const result = await Meteor.callAsync('admin.isAdmin');
        setIsAdmin(result);
        if (result) {
          await loadSettings();
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
