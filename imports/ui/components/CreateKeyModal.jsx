import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { X, Key, CheckCircle2, Circle, Loader2, Copy, Check, Eye, EyeOff, ExternalLink } from 'lucide-react';

const STEPS = [
  { id: 'create', label: 'Creating API Key' },
  { id: 'register', label: 'Registering On-Chain' },
];

export const CreateKeyModal = ({ walletAddress, onComplete, onClose }) => {
  const [step, setStep] = useState('input'); // input, creating, complete
  const [keyName, setKeyName] = useState('');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [error, setError] = useState(null);
  const [createdKey, setCreatedKey] = useState(null);
  const [txResult, setTxResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const markComplete = (stepId) => {
    setCompletedSteps(prev => [...prev, stepId]);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    setStep('creating');
    setError(null);

    try {
      // Step 1: Create key
      console.log('🔑 Creating API key...');
      setCurrentStepIndex(0);
      const result = await Meteor.callAsync('apiKeys.create', keyName.trim());
      console.log('   ✅ Key created');
      setCreatedKey(result);
      markComplete('create');

      // Step 2: On-chain registration (automatic if available)
      if (result.onchain && walletAddress) {
        setCurrentStepIndex(1);

        const deviceShare = localStorage.getItem('walletDeviceShare');
        if (!deviceShare) {
          throw new Error('Wallet key missing. Please log out and log back in.');
        }

        console.log('🔗 Registering on-chain...');
        const txResult = await Meteor.callAsync('wallet.signCreateKey', deviceShare, result.onchain);
        console.log('   ✅ Registered on-chain');
        console.log(`      tx: ${txResult.txHash}`);
        setTxResult(txResult);
        markComplete('register');
      }

      setStep('complete');
    } catch (err) {
      console.error('❌ Key creation failed:', err);
      setError(err.reason || err.message || 'Failed to create key');
      // If key was created but on-chain failed, still show the key
      if (createdKey) {
        setStep('complete');
      }
    }
  };

  const handleCopy = async () => {
    if (createdKey?.key) {
      await navigator.clipboard.writeText(createdKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDone = () => {
    onComplete(createdKey);
  };

  const isStepComplete = (stepId) => completedSteps.includes(stepId);
  const isStepActive = (index) => index === currentStepIndex && step === 'creating';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content create-key-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={20} />
        </button>

        {/* Input Step */}
        {step === 'input' && (
          <>
            <div className="modal-header">
              <Key size={24} className="modal-icon" />
              <h2>Create API Key</h2>
              <p>Enter a name for your new API key</p>
            </div>
            <form onSubmit={handleCreate} className="modal-body">
              <input
                type="text"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="e.g., Production Server"
                className="modal-input"
                autoFocus
              />
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={!keyName.trim()}>
                  Create Key
                </button>
              </div>
            </form>
          </>
        )}

        {/* Creating Step */}
        {step === 'creating' && (
          <>
            <div className="modal-header">
              <div className="modal-icon-loading">
                <Loader2 size={24} className="spinning" />
              </div>
              <h2>Setting Up</h2>
              <p>Please wait while we create your key</p>
            </div>
            <div className="modal-body">
              <div className="modal-steps">
                {STEPS.map((s, index) => (
                  <div
                    key={s.id}
                    className={`modal-step ${isStepComplete(s.id) ? 'complete' : ''} ${isStepActive(index) ? 'active' : ''}`}
                  >
                    <div className="modal-step-icon">
                      {isStepComplete(s.id) ? (
                        <CheckCircle2 size={20} />
                      ) : isStepActive(index) ? (
                        <Loader2 size={20} className="spinning" />
                      ) : (
                        <Circle size={20} />
                      )}
                    </div>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Complete Step */}
        {step === 'complete' && createdKey && (
          <>
            <div className="modal-header">
              <CheckCircle2 size={24} className="modal-icon success" />
              <h2>API Key Created</h2>
              <p>Save your key now - it won't be shown again</p>
            </div>
            <div className="modal-body">
              {error && (
                <div className="modal-warning">
                  {error}
                </div>
              )}

              <div className="key-display">
                <label>API Key</label>
                <div className="key-value">
                  <code>{showKey ? createdKey.key : '•'.repeat(40)}</code>
                  <button
                    className="key-action"
                    onClick={() => setShowKey(!showKey)}
                    title={showKey ? 'Hide' : 'Show'}
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button
                    className="key-action"
                    onClick={handleCopy}
                    title="Copy"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              {txResult && (
                <div className="tx-display">
                  <div className="tx-item">
                    <span className="tx-label">Transaction</span>
                    {txResult.explorerUrl ? (
                      <a
                        href={`${txResult.explorerUrl}/tx/${txResult.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tx-link"
                      >
                        <code>{txResult.txHash?.slice(0, 14)}...{txResult.txHash?.slice(-10)}</code>
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <code className="tx-value">{txResult.txHash?.slice(0, 14)}...{txResult.txHash?.slice(-10)}</code>
                    )}
                  </div>
                  <div className="tx-item">
                    <span className="tx-label">Block</span>
                    <span className="tx-value">#{txResult.blockNumber}</span>
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button className="btn btn-primary" onClick={handleDone}>
                  Done
                </button>
              </div>
            </div>
          </>
        )}

        {/* Error in input/creating */}
        {error && step !== 'complete' && (
          <div className="modal-body">
            <div className="modal-error">
              <p>{error}</p>
              <button className="btn btn-secondary" onClick={() => { setError(null); setStep('input'); }}>
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
