import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';
import Dashboard from './Dashboard';

// Configure base URLs
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000'; // legacy endpoints (may not be used)
const MCP_GATEWAY_URL = process.env.REACT_APP_MCP_GATEWAY_URL || 'http://localhost:8000';
const POLL_INTERVAL_MS = parseInt(process.env.REACT_APP_POLL_INTERVAL_MS || '3000', 10);

function App() {
  // State management
  const [experiments, setExperiments] = useState([]);
  const [currentView, setCurrentView] = useState('experiments'); // 'experiments' | 'dashboard'
  const [modalExperiment, setModalExperiment] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Short-burst refresher after creating experiments to ensure quick updates
  const burstIntervalRef = useRef(null);
  const burstTimeoutRef = useRef(null);
  const [selectedMode, setSelectedMode] = useState('code-analysis');
  const [codeInput, setCodeInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [lastComparePair, setLastComparePair] = useState(null);

  // Sample code for demo purposes
  const sampleCode = `def fibonacci(n):
    if n <= 1:
        return n
    else:
        return fibonacci(n-1) + fibonacci(n-2)

# Calculate the 10th Fibonacci number
result = fibonacci(10)
print(f"The 10th Fibonacci number is: {result}")`;

  // Poll experiments periodically using the MCP Gateway
  useEffect(() => {
    // Initial fetch
    fetchExperiments();

    const interval = setInterval(() => {
      fetchExperiments();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  // New fetchExperiments function that goes through the gateway
  const fetchExperiments = async () => {
    try {
      const response = await axios.post(
        `${MCP_GATEWAY_URL}/invoke`,
        {},
        { headers: { 'X-Docker-Tool': 'list_experiments' } }
      );
      setExperiments(response.data.experiments || []);
    } catch (error) {
      console.error('Error fetching experiments:', error);
    }
  };

  // Kick off a short polling burst after actions
  const bumpRefresh = (durationMs = 12000, intervalMs = 1500) => {
    try {
      if (burstIntervalRef.current) clearInterval(burstIntervalRef.current);
      if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
      // immediate fetch then interval
      fetchExperiments();
      burstIntervalRef.current = setInterval(fetchExperiments, intervalMs);
      burstTimeoutRef.current = setTimeout(() => {
        if (burstIntervalRef.current) clearInterval(burstIntervalRef.current);
        burstIntervalRef.current = null;
      }, durationMs);
    } catch (e) {
      // no-op
    }
  };

  // Handle experiment submission (supports compare mode and MCP Gateway)
  const handleSubmitExperiment = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (compareMode) {
        // Validate inputs
        if (!codeInput.trim() || !chatInput.trim()) {
          alert('Please enter both code and chat prompt for Compare Mode.');
          return;
        }

        const cerebrasReq = axios.post(
          `${MCP_GATEWAY_URL}/invoke`,
          { code: codeInput },
          { headers: { 'X-Docker-Tool': 'cerebras_coder' } }
        );

        const llamaReq = axios.post(
          `${MCP_GATEWAY_URL}/invoke`,
          { prompt: chatInput },
          { headers: { 'X-Docker-Tool': 'llama_chat' } }
        );

        const [cerebrasRes, llamaRes] = await Promise.all([cerebrasReq, llamaReq]);

        const cerebrasExp = {
          id: cerebrasRes.data.experiment_id,
          model_used: 'Cerebras-Coder',
          status: 'pending',
          input_payload: { code: codeInput },
          result: null,
          created_at: new Date().toISOString()
        };
        const llamaExp = {
          id: llamaRes.data.experiment_id,
          model_used: 'Llama-Chat',
          status: 'pending',
          input_payload: { prompt: chatInput },
          result: null,
          created_at: new Date().toISOString()
        };

        setExperiments(prev => [cerebrasExp, llamaExp, ...prev]);
        setLastComparePair({ left: cerebrasExp, right: llamaExp });

        // Proactively refresh a few times to capture updates
        bumpRefresh();

        // Clear inputs
        setCodeInput('');
        setChatInput('');
      } else {
        // Single mode via MCP Gateway
        const isCode = selectedMode === 'code-analysis';
        const payload = isCode ? { code: codeInput } : { prompt: chatInput };
        const tool = isCode ? 'cerebras_coder' : 'llama_chat';

        if (isCode && !codeInput.trim()) {
          alert('Please enter some Python code to analyze');
          return;
        }
        if (!isCode && !chatInput.trim()) {
          alert('Please enter a chat prompt');
          return;
        }

        const response = await axios.post(
          `${MCP_GATEWAY_URL}/invoke`,
          payload,
          { headers: { 'X-Docker-Tool': tool } }
        );

        const newExperiment = {
          id: response.data.experiment_id,
          model_used: isCode ? 'Cerebras-Coder' : 'Llama-Chat',
          status: 'pending',
          input_payload: payload,
          result: null,
          created_at: new Date().toISOString()
        };

        setExperiments(prev => [newExperiment, ...prev]);

        // Proactively refresh a few times to capture updates
        bumpRefresh();

        // Clear input fields
        if (isCode) setCodeInput(''); else setChatInput('');
      }
    } catch (error) {
      console.error('Error creating experiment:', error);
      alert('Error creating experiment: ' + (error.response?.data?.detail || error.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#22c55e';
      case 'running':
        return '#3b82f6';
      case 'failed':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  // Load sample code
  const loadSampleCode = () => {
    setCodeInput(sampleCode);
  };

  return (
    <div className="App">
      {/* Header */}
      <header className="app-header">
        <h1>⚡ AgentLabX</h1>
        <p>AI Experimentation Platform</p>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="neon-btn" onClick={() => setCurrentView('experiments')}>Experiments</button>
          <button className="neon-btn" onClick={() => setCurrentView('dashboard')}>Dashboard</button>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        {currentView === 'dashboard' ? (
          <section className="experiments-list neon-card neon-border" style={{ padding: 16 }}>
            <Dashboard />
          </section>
        ) : (
        <> 
        {/* Experiment Creation */}
        <section className="experiment-creation">
          <h2>Create New Experiment</h2>

          {/* Compare Mode Toggle */}
          <div className="compare-toggle" style={{ marginBottom: 12 }}>
            <label>
              <input type="checkbox" checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)} />
              {' '}Enable Compare Mode
            </label>
          </div>
          
          {/* Mode Selection (hidden in compare mode) */}
          {!compareMode && (
            <div className="mode-selection">
              <button
                className={`mode-button ${selectedMode === 'code-analysis' ? 'active' : ''}`}
                onClick={() => setSelectedMode('code-analysis')}
              >
                🔍 Code Analysis (Cerebras)
              </button>
              <button
                className={`mode-button ${selectedMode === 'chat' ? 'active' : ''}`}
                onClick={() => setSelectedMode('chat')}
              >
                💬 Chat (Llama)
              </button>
            </div>
          )}

          {/* Input Area */}
          <div className="input-area">
            {compareMode ? (
              <div className="compare-inputs" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="code-input-section">
                  <div className="input-header">
                    <label htmlFor="code-input">Python Code to Analyze:</label>
                    <button onClick={loadSampleCode} className="sample-button">
                      Load Sample Code
                    </button>
                  </div>
                  <textarea
                    id="code-input"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    placeholder="Enter your Python code here..."
                    rows={12}
                    className="code-textarea"
                  />
                </div>
                <div className="chat-input-section">
                  <label htmlFor="chat-input">Chat Prompt:</label>
                  <input
                    id="chat-input"
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Enter your question or prompt..."
                    className="chat-input"
                    onKeyPress={(e) => e.key === 'Enter' && handleSubmitExperiment()}
                  />
                </div>
              </div>
            ) : (
              selectedMode === 'code-analysis' ? (
                <div className="code-input-section">
                  <div className="input-header">
                    <label htmlFor="code-input">Python Code to Analyze:</label>
                    <button onClick={loadSampleCode} className="sample-button">
                      Load Sample Code
                    </button>
                  </div>
                  <textarea
                    id="code-input"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    placeholder="Enter your Python code here..."
                    rows={12}
                    className="code-textarea"
                  />
                </div>
              ) : (
                <div className="chat-input-section">
                  <label htmlFor="chat-input">Chat Prompt:</label>
                  <input
                    id="chat-input"
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Enter your question or prompt..."
                    className="chat-input"
                    onKeyPress={(e) => e.key === 'Enter' && handleSubmitExperiment()}
                  />
                </div>
              )
            )}
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmitExperiment}
            disabled={isSubmitting}
            className="submit-button"
          >
            {isSubmitting ? '🔄 Running...' : compareMode ? '🆚 Run Compare' : '🚀 Run Experiment'}
          </button>
        </section>

        {/* Compare Results (last run) */}
        {lastComparePair && (
          <section className="compare-results" style={{ marginTop: 24 }}>
            <h2>Compare Results</h2>
            <div className="experiments-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[lastComparePair.left, lastComparePair.right].map((experiment) => (
                <div key={experiment.id} className="experiment-card">
                  <div className="experiment-header">
                    <div className="experiment-model">
                      {experiment.model_used === 'Cerebras-Coder' ? '🔍' : '💬'} {experiment.model_used}
                    </div>
                    <div 
                      className="experiment-status"
                      style={{ color: getStatusColor(experiment.status) }}
                    >
                      {experiment.status.toUpperCase()}
                    </div>
                  </div>
                  <div className="experiment-input">
                    <strong>Input:</strong>
                    <div className="input-preview">
                      {experiment.input_payload?.code || experiment.input_payload?.prompt || 'N/A'}
                    </div>
                  </div>
                  {experiment.result && (
                    <div className="experiment-result">
                      <strong>Result:</strong>
                      <div className="result-content">
                        {experiment.result}
                      </div>
                    </div>
                  )}
                  <div className="experiment-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <small>Created: {formatTimestamp(experiment.created_at)}</small>
                      <small style={{ marginLeft: 8 }}>ID: {experiment.id}</small>
                    </div>
                    <button className="neon-btn" onClick={() => { setModalExperiment(experiment); setIsModalOpen(true); }}>View Details</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Experiments List */}
        <section className="experiments-list">
          <h2>Experiment History ({experiments.length})</h2>
          
          {experiments.length === 0 ? (
            <div className="empty-state">
              <p>No experiments yet. Create your first experiment above!</p>
            </div>
          ) : (
            <div className="experiments-grid">
              {experiments.map((experiment) => (
                <div key={experiment.id} className="experiment-card">
                  <div className="experiment-header">
                    <div className="experiment-model">
                      {experiment.model_used === 'Cerebras-Coder' ? '🔍' : '💬'} {experiment.model_used}
                    </div>
                    <div 
                      className="experiment-status"
                      style={{ color: getStatusColor(experiment.status) }}
                    >
                      {experiment.status.toUpperCase()}
                    </div>
                  </div>
                  
                  <div className="experiment-input">
                    <strong>Input:</strong>
                    <div className="input-preview">
                      {experiment.input_payload?.code || experiment.input_payload?.prompt || 'N/A'}
                    </div>
                  </div>
                  
                  {experiment.result && (
                    <div className="experiment-result">
                      <strong>Result:</strong>
                      <div className="result-content">
                        {experiment.result}
                      </div>
                    </div>
                  )}
                  
                  <div className="experiment-footer">
                    <small>Created: {formatTimestamp(experiment.created_at)}</small>
                    <small>ID: {experiment.id}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        {/* Modal Detail View */}
        {isModalOpen && modalExperiment && (
          <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ color: '#00fff7' }}>Experiment #{modalExperiment.id}</h3>
                <button className="modal-close-btn" onClick={() => setIsModalOpen(false)}>Close</button>
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
{JSON.stringify(modalExperiment, null, 2)}
              </pre>
            </div>
          </div>
        )}
        </>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>&copy; 2024 AgentLab - FutureStack'25 GenAI Hackathon Submission</p>
      </footer>
    </div>
  );
}

export default App;
