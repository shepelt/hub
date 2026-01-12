import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { Home, FlaskConical, Network, Settings, LogOut, Shield } from 'lucide-react';

const navItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/playground', label: 'Playground', icon: FlaskConical },
  { path: '/api', label: 'API', icon: Network },
];

const accountItems = [
  { path: '/settings', label: 'Settings', icon: Settings },
];

export const Sidebar = () => {
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);

  const user = useTracker(() => {
    Meteor.subscribe('userData');
    return Meteor.user();
  });

  useEffect(() => {
    if (user) {
      Meteor.callAsync('admin.isAdmin').then(setIsAdmin).catch(() => setIsAdmin(false));
    }
  }, [user?._id]);

  const handleLogout = () => {
    Meteor.logout((error) => {
      if (error) {
        console.error('Logout failed:', error);
      }
    });
  };

  const NavLink = ({ item }) => {
    const isActive = location.pathname === item.path;
    const Icon = item.icon;

    return (
      <Link
        to={item.path}
        className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
      >
        <Icon size={20} />
        <span>{item.label}</span>
      </Link>
    );
  };

  // Get user display info
  const userEmail = user?.services?.google?.email || user?.emails?.[0]?.address || '';
  const userName = user?.services?.google?.name || userEmail.split('@')[0] || 'User';
  const userPicture = user?.services?.google?.picture;

  // Get initials from name (e.g., "John Doe" -> "JD")
  const getInitials = (name) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  };
  const userInitials = getInitials(userName);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src="/HPP_logo_black.png" alt="HPP" className="sidebar-logo" />
        <span className="sidebar-title">HPP Hub</span>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section">
          {navItems.map((item) => (
            <NavLink key={item.path} item={item} />
          ))}
        </div>

        <div className="sidebar-divider" />

        <div className="sidebar-section">
          {accountItems.map((item) => (
            <NavLink key={item.path} item={item} />
          ))}
          {isAdmin && (
            <NavLink item={{ path: '/admin', label: 'Admin', icon: Shield }} />
          )}
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          {userPicture ? (
            <img src={userPicture} alt="" className="sidebar-user-avatar" referrerPolicy="no-referrer" />
          ) : (
            <div className="sidebar-user-avatar-placeholder">
              {userInitials}
            </div>
          )}
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{userName}</span>
            <span className="sidebar-user-email">{userEmail}</span>
          </div>
        </div>
        <button onClick={handleLogout} className="sidebar-logout-btn" title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
};
