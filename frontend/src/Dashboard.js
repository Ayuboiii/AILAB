import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const MCP_GATEWAY_URL = process.env.REACT_APP_MCP_GATEWAY_URL || 'http://localhost:8000';

export default function Dashboard() {
  const [data, setData] = useState({ arm_wins: [], avg_reward: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.post(
        `${MCP_GATEWAY_URL}/invoke`,
        {},
        { headers: { 'X-Docker-Tool': 'get_bandit_stats' } }
      );
      setData(res.data || { arm_wins: [], avg_reward: [] });
    } catch (e) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="font-mono" style={{ color: '#00fff7' }}>AgentLabX Dashboard</h2>
        <button className="neon-btn" onClick={fetchStats} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      {error && <div style={{ color: '#ff3b6b' }}>Error: {error}</div>}

      <div className="neon-card neon-border" style={{ padding: 12 }}>
        <h3 className="font-mono" style={{ color: '#a259ff', marginBottom: 8 }}>Arm Wins</h3>
        <div style={{ height: 280, background: '#121212', borderRadius: 12, padding: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.arm_wins}>
              <CartesianGrid stroke="#1f1f1f" />
              <XAxis dataKey="name" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip contentStyle={{ background: '#121212', border: '1px solid #00fff780', color: '#e5e7eb' }} />
              <Legend wrapperStyle={{ color: '#e5e7eb' }} />
              <Bar dataKey="wins" fill="#a259ff" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="neon-card neon-border" style={{ padding: 12 }}>
        <h3 className="font-mono" style={{ color: '#a259ff', marginBottom: 8 }}>Average Reward</h3>
        <div style={{ height: 280, background: '#121212', borderRadius: 12, padding: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.avg_reward}>
              <CartesianGrid stroke="#1f1f1f" />
              <XAxis dataKey="name" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip contentStyle={{ background: '#121212', border: '1px solid #a259ff80', color: '#e5e7eb' }} />
              <Legend wrapperStyle={{ color: '#e5e7eb' }} />
              <Bar dataKey="reward" fill="#00fff7" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
