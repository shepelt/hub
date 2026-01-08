import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';

export const Settings = () => {
  return (
    <div className="page">
      <div className="page-header">
        <SettingsIcon size={28} />
        <h1>Settings</h1>
      </div>
      <p className="page-description">
        Manage your account preferences and configurations.
      </p>
      <div className="placeholder-box">
        <span>Settings coming soon</span>
      </div>
    </div>
  );
};
