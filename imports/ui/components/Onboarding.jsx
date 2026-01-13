import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { CheckCircle2, Circle, Loader2, Wallet, Key, Link2, Fuel, ExternalLink } from 'lucide-react';

const STEPS = [
  { id: 'wallet', label: 'Creating Wallet', icon: Wallet, description: 'Generating secure MPC wallet' },
  { id: 'funding', label: 'Funding Wallet', icon: Fuel, description: 'Gas sponsorship for transactions' },
  { id: 'consumer', label: 'Setting Up Account', icon: Key, description: 'Creating API credentials' },
  { id: 'onchain', label: 'On-Chain Registration', icon: Link2, description: 'Recording to blockchain' },
];

export const Onboarding = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    runOnboarding();
  }, []);

  const markComplete = (stepId) => {
    setCompletedSteps(prev => [...prev, stepId]);
  };

  const runOnboarding = async () => {
    try {
      // Step 1: Create wallet
      console.log('🔐 Creating wallet...');
      setCurrentStep(0);
      const walletResult = await Meteor.callAsync('wallet.create');
      localStorage.setItem('walletDeviceShare', walletResult.deviceShare);
      console.log(`   ✅ Wallet: ${walletResult.address}`);
      markComplete('wallet');

      // Step 2: Funding (shown as separate step, happens during on-chain registration)
      setCurrentStep(1);
      console.log('⛽ Preparing gas funding...');
      await new Promise(r => setTimeout(r, 300));
      markComplete('funding');

      // Step 3: Create consumer
      console.log('🔑 Creating API credentials...');
      setCurrentStep(2);
      const initResult = await Meteor.callAsync('user.initConsumer', walletResult.address);
      console.log(`   ✅ Consumer created`);
      markComplete('consumer');

      // Step 4: On-chain registration
      setCurrentStep(3);
      if (initResult.onchain) {
        console.log('🔗 Registering on-chain...');
        const txResult = await Meteor.callAsync('wallet.signCreateKey', walletResult.deviceShare, initResult.onchain);
        console.log(`   ✅ tx: ${txResult.txHash}`);
        console.log(`   ✅ block: ${txResult.blockNumber}`);
        if (txResult.funding?.funded) {
          console.log(`   ⛽ funded: ${txResult.funding.amount} ETH`);
        }
        setResult({
          address: walletResult.address,
          txHash: txResult.txHash,
          blockNumber: txResult.blockNumber,
          explorerUrl: txResult.explorerUrl,
          funded: txResult.funding?.funded,
          fundAmount: txResult.funding?.amount
        });
      } else {
        console.log('   ⏭️ Skipped (no onchain data)');
      }
      markComplete('onchain');

      console.log('✅ Onboarding complete!');
      // Done - wait a moment then complete
      await new Promise(r => setTimeout(r, 1500));
      onComplete();
    } catch (err) {
      console.error('❌ Onboarding failed:', err);
      setError(err.reason || err.message || 'Setup failed');
    }
  };

  const isStepComplete = (stepId) => completedSteps.includes(stepId);
  const isStepActive = (index) => index === currentStep && !error;

  return (
    <div className="onboarding-screen">
      <div className="onboarding-container">
        {/* Header */}
        <div className="onboarding-header">
          <div className="onboarding-logo">
            <div className="logo-hex">
              <img src="/HPP_logo_white.png" alt="HPP" />
            </div>
          </div>
          <h1>Setting Up Your Account</h1>
          <p className="onboarding-subtitle">Initializing your Web3 identity</p>
        </div>

        {/* Progress Steps */}
        <div className="onboarding-steps">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const complete = isStepComplete(step.id);
            const active = isStepActive(index);

            return (
              <div
                key={step.id}
                className={`onboarding-step ${complete ? 'complete' : ''} ${active ? 'active' : ''}`}
              >
                <div className="step-icon">
                  {complete ? (
                    <CheckCircle2 size={24} className="icon-complete" />
                  ) : active ? (
                    <Loader2 size={24} className="icon-loading" />
                  ) : (
                    <Circle size={24} className="icon-pending" />
                  )}
                </div>
                <div className="step-content">
                  <div className="step-label">{step.label}</div>
                  <div className="step-description">{step.description}</div>
                </div>
                <div className="step-indicator">
                  <Icon size={18} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Result Display */}
        {result && (
          <div className="onboarding-result">
            <div className="result-item">
              <span className="result-label">Wallet</span>
              <span className="result-value mono">{result.address?.slice(0, 8)}...{result.address?.slice(-6)}</span>
            </div>
            {result.txHash && (
              <div className="result-item">
                <span className="result-label">Transaction</span>
                {result.explorerUrl ? (
                  <a
                    href={`${result.explorerUrl}/tx/${result.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="result-link"
                  >
                    <span className="mono">{result.txHash?.slice(0, 10)}...{result.txHash?.slice(-8)}</span>
                    <ExternalLink size={14} />
                  </a>
                ) : (
                  <span className="result-value mono">{result.txHash?.slice(0, 10)}...{result.txHash?.slice(-8)}</span>
                )}
              </div>
            )}
            {result.blockNumber && (
              <div className="result-item">
                <span className="result-label">Block</span>
                <span className="result-value">#{result.blockNumber}</span>
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="onboarding-error">
            <p>{error}</p>
            <button className="btn-retry" onClick={() => window.location.reload()}>
              Try Again
            </button>
          </div>
        )}

        {/* Background Animation */}
        <div className="onboarding-bg">
          <div className="bg-grid"></div>
          <div className="bg-glow"></div>
        </div>
      </div>
    </div>
  );
};
