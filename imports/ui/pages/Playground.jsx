import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { Menu, Send, Loader2, User, Bot, Plus, Trash2, MessageSquare, ChevronDown, MoreHorizontal, Copy, Check, Info } from 'lucide-react';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';
import { Playgrounds } from '../../api/collections.js';
import { getModels, getDefaultModel } from '../../api/models.js';

// Configure marked with KaTeX for math rendering
marked.use(markedKatex({
  throwOnError: false,
  nonStandard: true
}));
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Convert LaTeX delimiters: \[...\] -> $$...$$ and \(...\) -> $...$
const normalizeLatex = (content) => {
  if (!content) return '';
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')  // \[...\] -> $$...$$
    .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');      // \(...\) -> $...$
};

export const Playground = () => {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const [currentId, setCurrentId] = useState(chatId || null);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedModel, setSelectedModel] = useState(getDefaultModel());
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [copiedIndex, setCopiedIndex] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const menuRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setModelDropdownOpen(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Subscribe to playgrounds and get current one
  const { playgrounds, currentPlayground, status } = useTracker(() => {
    Meteor.subscribe('playgrounds');
    const playgrounds = Playgrounds.find({}, { sort: { updatedAt: -1 } }).fetch();
    const currentPlayground = currentId ? Playgrounds.findOne(currentId) : null;

    return {
      playgrounds,
      currentPlayground,
      status: currentPlayground?.status || 'idle'
    };
  }, [currentId]);

  const messages = currentPlayground?.messages || [];
  const isLoading = status === 'thinking' || status === 'streaming';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Autoscroll disabled - users prefer manual scrolling
  // useEffect(() => {
  //   scrollToBottom();
  // }, [messages]);

  // Sync URL with currentId
  useEffect(() => {
    if (currentId && currentId !== chatId) {
      navigate(`/playground/${currentId}`, { replace: true });
    } else if (!currentId && chatId) {
      navigate('/playground', { replace: true });
    }
  }, [currentId, chatId, navigate]);

  // Sync state when URL changes (direct navigation)
  useEffect(() => {
    if (chatId !== currentId) {
      setCurrentId(chatId || null);
    }
  }, [chatId]);

  // Load saved model when switching chats
  useEffect(() => {
    if (currentPlayground?.model) {
      setSelectedModel(currentPlayground.model);
    }
  }, [currentPlayground?.model]);

  const createNewPlayground = () => {
    Meteor.call('playground.create', selectedModel, (error, playgroundId) => {
      if (error) {
        console.error('Error creating playground:', error);
      } else {
        setCurrentId(playgroundId);
      }
    });
  };

  const confirmDelete = (id) => {
    Meteor.call('playground.delete', id, (error) => {
      if (error) {
        console.error('Error deleting playground:', error);
      } else if (currentId === id) {
        setCurrentId(null);
      }
    });
    setDeleteConfirmId(null);
  };

  const startRename = (id, currentTitle) => {
    setRenameId(id);
    setRenameValue(currentTitle);
    setOpenMenuId(null);
  };

  const submitRename = (id) => {
    if (renameValue.trim()) {
      Meteor.call('playground.rename', id, renameValue.trim(), (error) => {
        if (error) console.error('Error renaming:', error);
      });
    }
    setRenameId(null);
    setRenameValue('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isSending) return;

    const userMessage = input.trim();
    setInput('');
    setIsSending(true);

    // If no current playground, create one first
    let playgroundId = currentId;
    if (!playgroundId) {
      try {
        playgroundId = await new Promise((resolve, reject) => {
          Meteor.call('playground.create', selectedModel, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          });
        });
        setCurrentId(playgroundId);
      } catch (error) {
        console.error('Error creating playground:', error);
        setIsSending(false);
        return;
      }
    }

    try {
      await new Promise((resolve, reject) => {
        Meteor.call('playground.send', playgroundId, userMessage, selectedModel, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
      });
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsSending(false);
      // Focus after React re-renders and re-enables the input
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const copyToClipboard = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="playground-layout">
      {/* Playground Sidebar */}
      <div className="playground-sidebar">
        <div className="playground-sidebar-header">
          {/* Hamburger trigger - reveals main sidebar on hover */}
          <div className="hamburger-area">
            <button className="hamburger-btn">
              <Menu size={20} />
            </button>
          </div>
          <span className="sidebar-title">Playground</span>
        </div>
        <button className="playground-new-btn" onClick={createNewPlayground}>
          <Plus size={18} />
          New chat
        </button>
        <div className="playground-list">
          {playgrounds.map((pg) => (
            <div
              key={pg._id}
              className={`playground-item ${currentId === pg._id ? 'active' : ''}`}
              onClick={() => setCurrentId(pg._id)}
            >
              <MessageSquare size={16} />
              {renameId === pg._id ? (
                <input
                  className="playground-item-rename"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => submitRename(pg._id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitRename(pg._id);
                    if (e.key === 'Escape') { setRenameId(null); setRenameValue(''); }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span className="playground-item-title">{pg.title}</span>
              )}
              <div className="playground-item-menu" ref={openMenuId === pg._id ? menuRef : null}>
                <button
                  className="playground-item-menu-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(openMenuId === pg._id ? null : pg._id);
                  }}
                >
                  <MoreHorizontal size={14} />
                </button>
                {openMenuId === pg._id && (
                  <div className="playground-item-dropdown">
                    <button onClick={(e) => { e.stopPropagation(); startRename(pg._id, pg.title); }}>
                      Rename
                    </button>
                    <button className="danger" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(pg._id); setOpenMenuId(null); }}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="playground">
        <div className="playground-top">
          <div className="model-dropdown" ref={dropdownRef}>
            <button
              className="model-dropdown-trigger"
              onClick={() => !isLoading && setModelDropdownOpen(!modelDropdownOpen)}
              disabled={isLoading}
            >
              {getModels().find(m => m.id === selectedModel)?.name || 'Select model'}
              <ChevronDown size={14} />
            </button>
            {modelDropdownOpen && (
              <div className="model-dropdown-menu">
                {getModels().map((m) => (
                  <button
                    key={m.id}
                    className={`model-dropdown-item ${selectedModel === m.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedModel(m.id);
                      setModelDropdownOpen(false);
                      // Save model to existing chat
                      if (currentId) {
                        Meteor.call('playground.setModel', currentId, m.id);
                      }
                    }}
                  >
                    <span className="model-dropdown-item-name">{m.name}</span>
                    <span className="model-dropdown-item-desc">{m.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="playground-chat">
          {messages.length === 0 && !isLoading ? (
            <div className="playground-empty">
              <Bot size={48} />
              <h2>Start a conversation</h2>
              <p>Ask anything about HPP or test the AI assistant.</p>
            </div>
          ) : (
            <div className="playground-messages">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`message ${msg.role} ${msg.isError ? 'error' : ''} ${msg.isStreaming ? 'streaming' : ''}`}
                >
                  <div className="message-icon">
                    {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                  </div>
                  <div className="message-content">
                    {msg.role === 'assistant' ? (
                      <div dangerouslySetInnerHTML={{ __html: marked.parse(normalizeLatex(msg.content)) }} />
                    ) : (
                      msg.content
                    )}
                    {msg.isStreaming && <span className="streaming-cursor" />}
                    {msg.role === 'assistant' && !msg.isStreaming && msg.content && (
                      <div className="message-footer">
                        <div className="message-info-wrapper">
                          <button className="message-action-btn" title="Usage stats">
                            <Info size={16} />
                          </button>
                          <div className="message-stats-tooltip">
                            {msg.model && <>{getModels().find(m => m.id === msg.model)?.name || msg.model}</>}
                            {msg.inputTokens > 0 && (
                              <>
                                {msg.model && ' · '}
                                {msg.inputTokens} in · {msg.outputTokens} out
                                {msg.latencyMs > 0 && (
                                  <> · {(msg.latencyMs / 1000).toFixed(1)}s · {Math.round(msg.outputTokens / (msg.latencyMs / 1000))} tok/s</>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          className="message-action-btn"
                          onClick={() => copyToClipboard(msg.content, index)}
                          title="Copy to clipboard"
                        >
                          {copiedIndex === index ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {status === 'thinking' && (
                <div className="message assistant thinking">
                  <div className="message-icon">
                    <Bot size={20} />
                  </div>
                  <div className="message-content">
                    <Loader2 size={16} className="spinner" />
                    <span className="status-text">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <form className="playground-input" onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            disabled={isLoading}
          />
          <button type="submit" disabled={!input.trim() || isLoading}>
            {isLoading ? <Loader2 size={20} className="spinner" /> : <Send size={20} />}
          </button>
        </form>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete chat?</h3>
            <p>This will permanently delete this conversation and its workspace.</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </button>
              <button className="modal-btn danger" onClick={() => confirmDelete(deleteConfirmId)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
