import React from 'react';
import { Network } from 'lucide-react';

export const Router = () => {
  return (
    <div className="page">
      <div className="page-header">
        <Network size={28} />
        <h1>Router</h1>
      </div>
      <p className="page-description">
        Configure and manage your HPP routing infrastructure.
      </p>
      <div className="placeholder-box">
        <span>Router configuration coming soon</span>
      </div>
    </div>
  );
};
