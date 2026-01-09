import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar.jsx';

export const MainLayout = () => {
  const location = useLocation();
  const isPlayground = location.pathname.startsWith('/playground');

  return (
    <div className={`app-layout ${isPlayground ? 'playground-mode' : ''}`}>
      <div className="sidebar-container">
        <Sidebar />
      </div>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};
