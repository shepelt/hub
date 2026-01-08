import React from 'react';
import { Home as HomeIcon } from 'lucide-react';

export const Home = () => {
  return (
    <div className="page">
      <div className="page-header">
        <HomeIcon size={28} />
        <h1>Home</h1>
      </div>
      <p className="page-description">
        Welcome to HPP Hub - your developer portal for House Party Protocol.
      </p>
      <div className="placeholder-box">
        <span>Home content coming soon</span>
      </div>
    </div>
  );
};
