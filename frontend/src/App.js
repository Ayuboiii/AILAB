import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import './App.css';

// Configure base URLs
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000'; // legacy endpoints (may not be used)
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:8000';
const MCP_GATEWAY_URL = process.env.REACT_APP_MCP_GATEWAY_URL || 'http://localhost:8000';

function App() {
  // State management
  const [experiments, setExperiments] = useState([]);
  const [selectedMode, setSelectedMode] = useState('code-analysis');
  const [codeInput, setCodeInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [socket, setSocket] = useState(null);
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

  // Initialize socket connection and fetch experiments (fetch may no-op post-microservices)
  useEffect(() => {
    // Initialize socket connection (gateway may not support it; safe to keep for now)
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket');
      setConnectionStatus('Connected');
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from WebSocket');
      setConnectionStatus('Disconnected');
    });

    newSocket.on('connected', (data) => {
      console.log('Server connection confirmed:', data);
    });

    newSocket.on('experiment_updated', (experimentData) => {
      console.log('Experiment updated:', experimentData);
      // Update the specific experiment in the list
      setExperiments(prev => 
        prev.map(exp => 
          exp.id === experimentData.id ? experimentData : exp
        )
      );
    });

    setSocket(newSocket);

    // Fetch existing experiments (optional; gateway may not route this)
    fetchExperiments();

    // Cleanup on unmount
    return () => {
      newSocket.close();
    };
  }, []);

  // Fetch experiments from legacy API (best-effort)
  const fetchExperiments = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/experiments`);
      setExperiments(response.data.experiments || []);
    } catch (error) {
      console.warn('Experiments listing may be unavailable in microservices mode:', error?.message);
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
        <h1>🧪 AgentLab</h1>
        <p>AI Experiment Platform powered by Cerebras & Llama</p>
        <div className="connection-status">
          Status: <span style={{ color: connectionStatus === 'Connected' ? '#22c55e' : '#ef4444' }}>
            {connectionStatus}
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
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
                  <div className="experiment-footer">
                    <small>Created: {formatTimestamp(experiment.created_at)}</small>
                    <small>ID: {experiment.id}</small>
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
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>&copy; 2024 AgentLab - FutureStack'25 GenAI Hackathon Submission</p>
      </footer>
    </div>
  );
}

export default App;
