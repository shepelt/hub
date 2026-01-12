import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar.jsx';

export const MainLayout = () => {
  const location = useLocation();
  const isPlayground = location.pathname.startsWith('/playground');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevIsPlayground = useRef(isPlayground);

  useEffect(() => {
    // When entering playground mode, briefly disable hover
    if (isPlayground && !prevIsPlayground.current) {
      setIsTransitioning(true);
      const timer = setTimeout(() => setIsTransitioning(false), 300);
      return () => clearTimeout(timer);
    }
    prevIsPlayground.current = isPlayground;
  }, [isPlayground]);

  const classes = [
    'app-layout',
    isPlayground ? 'playground-mode' : '',
    isTransitioning ? 'sidebar-transitioning' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <div className="sidebar-container">
        <Sidebar />
      </div>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};
