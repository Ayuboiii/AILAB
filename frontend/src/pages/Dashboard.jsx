import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const MCP_GATEWAY_URL = process.env.REACT_APP_MCP_GATEWAY_URL || 'http://localhost:8000';
const POLL_INTERVAL_MS = parseInt(process.env.REACT_APP_POLL_INTERVAL_MS || '3000', 10);

export default function Dashboard() {
  const [experimentId, setExperimentId] = useState('');
  const [metrics, setMetrics] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [simSteps, setSimSteps] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch metrics via MCP (fetch_metrics -> GET /bandits/metrics)
  const fetchMetrics = async (id) => {
    if (!id) return;
    try {
      const res = await axios.post(
        `${MCP_GATEWAY_URL}/invoke`,
        { path_params: { experiment_id: Number(id) } },
        { headers: { 'X-Docker-Tool': 'fetch_metrics' } }
      );
      setMetrics(res.data);
    } catch (e) {
      console.error('Metrics error:', e);
    }
  };

  // Fetch latest explanation (explain_decision -> GET /explanations/latest)
  const fetchExplanation = async (id) => {
    if (!id) return;
    try {
      const res = await axios.post(
        `${MCP_GATEWAY_URL}/invoke`,
        { path_params: { experiment_id: Number(id) } },
        { headers: { 'X-Docker-Tool': 'explain_decision' } }
      );
      setExplanation(res.data?.explanation || null);
    } catch (e) {
      console.error('Explanation error:', e);
    }
  };

  // Run simulation (simulation_run -> POST /sim/run)
  const runSimulation = async () => {
    try {
      setIsLoading(true);
      const res = await axios.post(
        `${MCP_GATEWAY_URL}/invoke`,
        { steps: 20, lr: 0.2, x0: 5 },
        { headers: { 'X-Docker-Tool': 'simulation_run' } }
      );
      setSimSteps(res.data?.steps || []);
    } catch (e) {
      console.error('Simulation error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // One-click demo: create experiment, run picks, log rewards, refresh panels
  const runQuickDemo = async () => {
    try {
      setIsLoading(true);
      // 1) Create experiment with 3 arms
      const createRes = await axios.post(
        `${MCP_GATEWAY_URL}/invoke`,
        { arms: ["A", "B", "C"] },
        { headers: { 'X-Docker-Tool': 'bandit_create' } }
      );
      const newId = createRes.data?.experiment_id;
      if (!newId) throw new Error('Failed to create experiment');
      setExperimentId(String(newId));

      // 2) Run N picks with UCB and log simple rewards
      const N = 15;
      for (let i = 0; i < N; i++) {
        const pickRes = await axios.post(
          `${MCP_GATEWAY_URL}/invoke`,
          { experiment_id: newId, policy: 'ucb', epsilon: 0.1, context: { demo: true, i } },
          { headers: { 'X-Docker-Tool': 'bandit_run' } }
        );
        const armId = pickRes.data?.arm_id;
        // Synthetic reward rule: prefer middle arm id mildly, others randomly
        const reward = typeof armId === 'number' ? (armId % 3 === 2 ? 1.0 : (Math.random() < 0.4 ? 1.0 : 0.0)) : 0.0;
        await axios.post(
          `${MCP_GATEWAY_URL}/invoke`,
          { experiment_id: newId, arm_id: armId, reward },
          { headers: { 'X-Docker-Tool': 'log_result' } }
        );
      }

      // 3) Refresh metrics and latest explanation
      await fetchMetrics(newId);
      await fetchExplanation(newId);
    } catch (e) {
      console.error('Quick demo error:', e);
      alert('Quick demo failed: ' + (e?.response?.data?.detail || e.message));
    } finally {
      setIsLoading(false);
    }
  };

  // Polling loop for metrics/explanation
  useEffect(() => {
    if (!experimentId) return;
    fetchMetrics(experimentId);
    fetchExplanation(experimentId);
    const t = setInterval(() => {
      fetchMetrics(experimentId);
      fetchExplanation(experimentId);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [experimentId]);

  const armWinData = useMemo(() => {
    if (!metrics?.arm_stats) return [];
    return Object.entries(metrics.arm_stats).map(([armId, s]) => ({ arm: String(armId), picks: s.picks || 0 }));
  }, [metrics]);

  const armAvgRewardData = useMemo(() => {
    if (!metrics?.arm_stats) return [];
    return Object.entries(metrics.arm_stats).map(([armId, s]) => ({ arm: String(armId), avg: s.avg_reward || 0 }));
  }, [metrics]);

  const simData = useMemo(() => simSteps.map(s => ({ step: s.step, f: s.f })), [simSteps]);

  return (
    <div className="dashboard-root" style={{ display: 'grid', gap: 16 }}>
      {/* Controls */}
      <div className="neon-card neon-border" style={{ padding: 16 }}>
        <h2 className="font-mono" style={{ color: '#00fff7', marginBottom: 12 }}>Dashboard Controls</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <label className="font-mono" style={{ color: '#9ca3af', fontSize: 12 }}>Experiment ID</label>
            <input
              className="chat-input"
              value={experimentId}
              onChange={(e) => setExperimentId(e.target.value)}
              placeholder="e.g. 1"
              style={{ width: 160, marginLeft: 8 }}
            />
          </div>
          <button className="neon-btn" onClick={() => { fetchMetrics(experimentId); fetchExplanation(experimentId); }}>
            Refresh
          </button>
          <button className="neon-btn" onClick={runSimulation} disabled={isLoading}>
            {isLoading ? 'Running…' : 'Run Simulation'}
          </button>
          <button className="neon-btn" onClick={runQuickDemo} disabled={isLoading}>
            {isLoading ? 'Working…' : 'Run Quick Demo'}
          </button>
        </div>
      </div>

      {/* Grid: Charts + Explanation */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
        <div className="neon-card neon-border" style={{ padding: 16 }}>
          <h3 className="font-mono" style={{ color: '#a259ff', marginBottom: 12 }}>Bandit Performance</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, height: 300 }}>
            <div className="panel" style={{ background: '#121212', padding: 8, borderRadius: 12 }}>
              <div className="font-mono" style={{ color: '#9ca3af', fontSize: 12, marginBottom: 4 }}>Arm Wins (Picks)</div>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={armWinData}>
                  <CartesianGrid stroke="#1f1f1f" />
                  <XAxis dataKey="arm" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip contentStyle={{ background: '#121212', border: '1px solid #00fff780', color: '#e5e7eb' }} />
                  <Legend wrapperStyle={{ color: '#e5e7eb' }} />
                  <Bar dataKey="picks" fill="#a259ff" stroke="#a259ff" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="panel" style={{ background: '#121212', padding: 8, borderRadius: 12 }}>
              <div className="font-mono" style={{ color: '#9ca3af', fontSize: 12, marginBottom: 4 }}>Avg Reward per Arm</div>
              <ResponsiveContainer width="100%" height="90%">
                <LineChart data={armAvgRewardData}>
                  <CartesianGrid stroke="#1f1f1f" />
                  <XAxis dataKey="arm" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip contentStyle={{ background: '#121212', border: '1px solid #a259ff80', color: '#e5e7eb' }} />
                  <Legend wrapperStyle={{ color: '#e5e7eb' }} />
                  <Line type="monotone" dataKey="avg" stroke="#00fff7" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="neon-card neon-border" style={{ padding: 16 }}>
          <h3 className="font-mono" style={{ color: '#ff007c', marginBottom: 12 }}>Cerebras Explanation</h3>
          {!explanation ? (
            <div style={{ color: '#9ca3af' }}>No explanation yet. Trigger a pick to generate one.</div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <span className="badge" style={{ borderColor: '#a259ff', color: '#a259ff' }}>{explanation.model || 'model'}</span>
                <span className="badge" style={{ borderColor: '#00fff7', color: '#00fff7' }}>{explanation.latency_ms ?? '–'} ms</span>
                <span className="badge" style={{ borderColor: '#ff007c', color: '#ff007c' }}>{(explanation.tokens?.total_tokens) ?? (explanation.tokens?.completion_tokens) ?? '–'} tok</span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', color: '#e5e7eb', lineHeight: 1.5 }}>{explanation.rationale}</div>
            </div>
          )}
        </div>
      </div>

      {/* Simulation Panel */}
      <div className="neon-card neon-border" style={{ padding: 16 }}>
        <h3 className="font-mono" style={{ color: '#00fff7', marginBottom: 12 }}>Simulation: Gradient Descent on (x-3)^2</h3>
        <div style={{ height: 260, background: '#121212', borderRadius: 12, padding: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={simData}>
              <CartesianGrid stroke="#1f1f1f" />
              <XAxis dataKey="step" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip contentStyle={{ background: '#121212', border: '1px solid #00fff780', color: '#e5e7eb' }} />
              <Line type="monotone" dataKey="f" stroke="#ff007c" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
