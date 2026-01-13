import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { ServiceConfiguration } from 'meteor/service-configuration';
import { useNavigate } from 'react-router-dom';
import { useTracker } from 'meteor/react-meteor-data';
import { Onboarding } from '../components/Onboarding.jsx';

export const Login = () => {
  const navigate = useNavigate();
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Wait for Google service configuration to be loaded
  const configReady = useTracker(() => {
    const googleConfig = ServiceConfiguration.configurations.findOne({ service: 'google' });
    return !!googleConfig;
  }, []);

  const handleGoogleLogin = () => {
    Meteor.loginWithGoogle(
      {
        requestPermissions: ['email', 'profile'],
        requestOfflineToken: false,
        forceApprovalPrompt: false,
      },
      async (error) => {
        if (error) {
          if (error.errorType === 'Accounts.LoginCancelledError') {
            return;
          }
          console.error('Login failed:', error);
          alert('Login failed: ' + error.reason);
        } else {
          // Check if user needs onboarding
          try {
            const status = await Meteor.callAsync('user.checkStatus');
            console.log('User status:', status);

            if (status.needsOnboarding) {
              // Show onboarding UI
              setShowOnboarding(true);
            } else {
              // Existing user - check deviceShare
              if (!localStorage.getItem('walletDeviceShare') && status.walletAddress) {
                console.log('🔄 Recovering device share...');
                const recovered = await Meteor.callAsync('user.recoverWallet');
                localStorage.setItem('walletDeviceShare', recovered.deviceShare);
                console.log('✅ Device share recovered');
              }
              navigate('/');
            }
          } catch (err) {
            console.error('Status check failed:', err);
            navigate('/');
          }
        }
      }
    );
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    navigate('/');
  };

  // Show onboarding screen
  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <img src="/HPP_logo_black.png" alt="HPP" className="login-logo" />
          <h1>HPP Hub</h1>
          <p>Developer portal for House Party Protocol</p>
        </div>

        <div className="login-buttons">
          <button
            onClick={handleGoogleLogin}
            disabled={!configReady}
            className="login-btn login-btn-google"
          >
            <svg className="login-btn-icon" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <button
            disabled
            className="login-btn login-btn-email"
            title="Coming soon"
          >
            <svg className="login-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="M22 6l-10 7L2 6"/>
            </svg>
            <span>Continue with email</span>
          </button>
        </div>

        <p className="login-footer">
          Sign in to access HPP developer tools
        </p>
      </div>
    </div>
  );
};
