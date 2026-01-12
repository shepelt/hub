import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { Settings as SettingsIcon, AlertTriangle } from 'lucide-react';

export const Settings = () => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const user = useTracker(() => Meteor.user());
  const userEmail = user?.services?.google?.email || '';

  const handleDeleteAccount = async () => {
    if (confirmEmail !== userEmail) {
      setError('Email does not match');
      return;
    }

    setDeleting(true);
    setError('');

    try {
      await Meteor.callAsync('account.delete', confirmEmail);
      // User will be logged out automatically since their account is deleted
      window.location.href = '/login';
    } catch (err) {
      setError(err.reason || 'Failed to delete account');
      setDeleting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <SettingsIcon size={28} />
        <h1>Settings</h1>
      </div>
      <p className="page-description">
        Manage your account preferences and configurations.
      </p>

      <div className="settings-section">
        <h2>Account</h2>
        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">Email</span>
            <span className="settings-item-value">{userEmail}</span>
          </div>
        </div>
      </div>

      <div className="settings-section danger-zone">
        <h2>Danger Zone</h2>
        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">Delete Account</span>
            <span className="settings-item-description">
              Permanently delete your account and all associated data including API keys, chats, and usage history.
            </span>
          </div>
          <button
            className="btn btn-danger"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete Account
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div className="modal modal-danger" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">
              <AlertTriangle size={32} />
            </div>
            <h3>Delete Account</h3>
            <p>
              This action is <strong>permanent and irreversible</strong>. All your data will be deleted:
            </p>
            <ul className="modal-list">
              <li>API keys and Router consumer</li>
              <li>Chat history and playgrounds</li>
              <li>Usage history and quota</li>
            </ul>
            <p>
              To confirm, please enter your email address:
            </p>
            <input
              type="email"
              placeholder={userEmail}
              value={confirmEmail}
              onChange={(e) => {
                setConfirmEmail(e.target.value);
                setError('');
              }}
              disabled={deleting}
              autoFocus
            />
            {error && <p className="modal-error">{error}</p>}
            <div className="modal-actions">
              <button
                className="modal-btn cancel"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setConfirmEmail('');
                  setError('');
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="modal-btn danger"
                onClick={handleDeleteAccount}
                disabled={deleting || confirmEmail !== userEmail}
              >
                {deleting ? 'Deleting...' : 'Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
