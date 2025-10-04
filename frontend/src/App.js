import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import './App.css';

// Configure API base URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:8000';

function App() {
  // State management
  const [experiments, setExperiments] = useState([]);
  const [selectedMode, setSelectedMode] = useState('code-analysis');
  const [codeInput, setCodeInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [socket, setSocket] = useState(null);

  // Sample code for demo purposes
  const sampleCode = `def fibonacci(n):
    if n <= 1:
        return n
    else:
        return fibonacci(n-1) + fibonacci(n-2)

# Calculate the 10th Fibonacci number
result = fibonacci(10)
print(f"The 10th Fibonacci number is: {result}")`;

  // Initialize socket connection and fetch experiments
  useEffect(() => {
    // Initialize socket connection
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

    // Fetch existing experiments
    fetchExperiments();

    // Cleanup on unmount
    return () => {
      newSocket.close();
    };
  }, []);

  // Fetch experiments from API
  const fetchExperiments = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/experiments`);
      setExperiments(response.data.experiments || []);
    } catch (error) {
      console.error('Error fetching experiments:', error);
    }
  };

  // Handle experiment submission
  const handleSubmitExperiment = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      let endpoint, payload;

      if (selectedMode === 'code-analysis') {
        if (!codeInput.trim()) {
          alert('Please enter some Python code to analyze');
          return;
        }
        endpoint = '/experiments/code-analysis';
        payload = { code: codeInput };
      } else {
        if (!chatInput.trim()) {
          alert('Please enter a chat prompt');
          return;
        }
        endpoint = '/experiments/chat';
        payload = { prompt: chatInput };
      }

      const response = await axios.post(`${API_BASE_URL}${endpoint}`, payload);
      
      console.log('Experiment created:', response.data);

      // Add the new experiment to the list (it will be updated via WebSocket)
      const newExperiment = {
        id: response.data.experiment_id,
        model_used: selectedMode === 'code-analysis' ? 'Cerebras-Coder' : 'Llama-Chat',
        status: 'pending',
        input_payload: payload,
        result: null,
        created_at: new Date().toISOString()
      };

      setExperiments(prev => [newExperiment, ...prev]);

      // Clear input fields
      if (selectedMode === 'code-analysis') {
        setCodeInput('');
      } else {
        setChatInput('');
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
          
          {/* Mode Selection */}
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

          {/* Input Area */}
          <div className="input-area">
            {selectedMode === 'code-analysis' ? (
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
            )}
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmitExperiment}
            disabled={isSubmitting}
            className="submit-button"
          >
            {isSubmitting ? '🔄 Running Experiment...' : '🚀 Run Experiment'}
          </button>
        </section>

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