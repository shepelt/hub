import React from 'react';
import { FlaskConical } from 'lucide-react';

export const Playground = () => {
  return (
    <div className="page">
      <div className="page-header">
        <FlaskConical size={28} />
        <h1>Playground</h1>
      </div>
      <p className="page-description">
        Experiment with HPP APIs and test your integrations.
      </p>
      <div className="placeholder-box">
        <span>Playground coming soon</span>
      </div>
    </div>
  );
};
