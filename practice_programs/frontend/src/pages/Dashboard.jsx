import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Activity, BookOpen, Clock, AlertCircle, Database, Video, PenTool, RefreshCw } from 'lucide-react';

const GithubIcon = ({ size = 20, color = "currentColor" }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-github">
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

const CodeIcon = ({ size = 20, color = "currentColor" }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-code">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);


export default function Dashboard() {
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [dueTopics, setDueTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [integrationStatus, setIntegrationStatus] = useState(null);
  const [syncingGitHub, setSyncingGitHub] = useState(false);
  const [syncingLeetCode, setSyncingLeetCode] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const [todayRes, dueRes, statsRes, statusRes] = await Promise.all([
          api.searchToday(),
          api.getDueTopics().catch(() => ({ topics: [] })),
          api.getStats().catch(() => null),
          api.getIntegrationStatus().catch(() => null)
        ]);
        setData(todayRes);
        setDueTopics(dueRes.topics || []);
        setStats(statsRes);
        setIntegrationStatus(statusRes);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    async function autoSyncToday() {
      // Silently fire all-today fetch in the background on page open
      try {
        const result = await api.fetchAllToday();
        // If anything was saved, refresh the dashboard data
        const anyNew = Object.values(result.results || {}).some(r => r.status === 'ok');
        if (anyNew) {
          const [todayRes, statsRes] = await Promise.all([
            api.searchToday(),
            api.getStats().catch(() => null)
          ]);
          setData(todayRes);
          setStats(statsRes);
          setSyncMessage('? Auto-synced today\'s GitHub & LeetCode activity');
          setTimeout(() => setSyncMessage(''), 5000);
        }
      } catch {
        // Silently ignore - integrations may not be configured
      }
    }

    fetchData().then(() => autoSyncToday());
  }, []);

  const handleSync = async (type) => {
    if (type === 'github') {
      setSyncingGitHub(true);
      setSyncMessage('Syncing GitHub activity...');
      try {
        const res = await api.syncGitHub();
        setSyncMessage(res.message || 'GitHub sync complete!');
        // Refresh dashboard data
        const [todayRes, statsRes] = await Promise.all([
          api.searchToday(),
          api.getStats().catch(() => null)
        ]);
        setData(todayRes);
        setStats(statsRes);
      } catch (err) {
        console.error(err);
        setSyncMessage(err.response?.data?.detail || 'GitHub sync failed.');
      } finally {
        setSyncingGitHub(false);
        setTimeout(() => setSyncMessage(''), 6000);
      }
    } else if (type === 'leetcode') {
      setSyncingLeetCode(true);
      setSyncMessage('Syncing LeetCode submissions...');
      try {
        const res = await api.syncLeetCode();
        setSyncMessage(res.message || 'LeetCode sync complete!');
        // Refresh dashboard data
        const [todayRes, statsRes] = await Promise.all([
          api.searchToday(),
          api.getStats().catch(() => null)
        ]);
        setData(todayRes);
        setStats(statsRes);
      } catch (err) {
        console.error(err);
        setSyncMessage(err.response?.data?.detail || 'LeetCode sync failed.');
      } finally {
        setSyncingLeetCode(false);
        setTimeout(() => setSyncMessage(''), 6000);
      }
    }
  };

  if (loading) return <div className="animate-fade-in" style={{ textAlign: 'center', marginTop: '4rem' }}>Loading your dashboard...</div>;

  return (
    <div className="animate-fade-in">
      <h1 style={{ marginBottom: '2rem', fontSize: '2rem' }}>Welcome Back</h1>
      
      {/* Integrations Control Panel */}
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
              <RefreshCw className={(syncingGitHub || syncingLeetCode) ? 'animate-spin' : ''} size={18} color="var(--primary-glow)" />
              Integrations & Sync Manager
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Automatic sync runs daily at 11:30 PM. Trigger a manual sync below to instantly import today's accomplishments.
            </p>
          </div>
          
          <button 
            className="btn-primary" 
            disabled={syncingGitHub || syncingLeetCode}
            onClick={async () => {
              setSyncingGitHub(true);
              setSyncingLeetCode(true);
              setSyncMessage('Syncing all integrations...');
              try {
                const [ghRes, lcRes] = await Promise.all([
                  api.syncGitHub().catch(e => ({ message: `GitHub error: ${e.response?.data?.detail || e.message}` })),
                  api.syncLeetCode().catch(e => ({ message: `LeetCode error: ${e.response?.data?.detail || e.message}` }))
                ]);
                
                const ghMsg = ghRes.message || 'Complete';
                const lcMsg = lcRes.message || 'Complete';
                setSyncMessage(`Sync done! GitHub: ${ghMsg} | LeetCode: ${lcMsg}`);
                
                // Refresh data
                const [todayRes, statsRes] = await Promise.all([
                  api.searchToday(),
                  api.getStats().catch(() => null)
                ]);
                setData(todayRes);
                setStats(statsRes);
              } catch (err) {
                console.error(err);
                setSyncMessage('Sync failed.');
              } finally {
                setSyncingGitHub(false);
                setSyncingLeetCode(false);
                setTimeout(() => setSyncMessage(''), 8000);
              }
            }}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              padding: '8px 20px',
              fontSize: '0.85rem',
              opacity: (syncingGitHub || syncingLeetCode) ? 0.6 : 1,
              cursor: (syncingGitHub || syncingLeetCode) ? 'not-allowed' : 'pointer',
              pointerEvents: (syncingGitHub || syncingLeetCode) ? 'none' : 'auto'
            }}
          >
            <RefreshCw size={14} className={(syncingGitHub || syncingLeetCode) ? 'animate-spin' : ''} />
            Sync All Now
          </button>
        </div>

        {/* Integration Status Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          
          {/* GitHub Status */}
          <div className="glass-card" style={{ padding: '1rem', background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <GithubIcon size={20} color="var(--text-main)" />
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>GitHub</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '2px' }}>
                  <span className={integrationStatus?.github_configured ? 'animate-pulse' : ''} style={{ 
                    width: '6px', height: '6px', borderRadius: '50%', 
                    background: integrationStatus?.github_configured ? '#10b981' : '#ef4444',
                    display: 'inline-block'
                  }}></span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 500, color: integrationStatus?.github_configured ? '#34d399' : '#f87171' }}>
                    {integrationStatus?.github_configured ? 'Connected' : 'Not Configured'}
                  </span>
                </div>
              </div>
            </div>
            {integrationStatus?.github_configured && (
              <button 
                onClick={() => handleSync('github')}
                disabled={syncingGitHub || syncingLeetCode}
                className="btn-secondary"
                style={{ padding: '4px 12px', fontSize: '0.75rem', borderRadius: '6px' }}
              >
                {syncingGitHub ? 'Syncing...' : 'Sync'}
              </button>
            )}
          </div>

          {/* LeetCode Status */}
          <div className="glass-card" style={{ padding: '1rem', background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ padding: '0.5rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CodeIcon size={20} color="#f59e0b" />
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>LeetCode</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '2px' }}>
                  <span className={integrationStatus?.leetcode_configured ? 'animate-pulse' : ''} style={{ 
                    width: '6px', height: '6px', borderRadius: '50%', 
                    background: integrationStatus?.leetcode_configured ? '#10b981' : '#ef4444',
                    display: 'inline-block'
                  }}></span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 500, color: integrationStatus?.leetcode_configured ? '#34d399' : '#f87171' }}>
                    {integrationStatus?.leetcode_configured ? 'Connected' : 'Not Configured'}
                  </span>
                </div>
              </div>
            </div>
            {integrationStatus?.leetcode_configured && (
              <button 
                onClick={() => handleSync('leetcode')}
                disabled={syncingGitHub || syncingLeetCode}
                className="btn-secondary"
                style={{ padding: '4px 12px', fontSize: '0.75rem', borderRadius: '6px' }}
              >
                {syncingLeetCode ? 'Syncing...' : 'Sync'}
              </button>
            )}
          </div>

        </div>

        {/* Sync Progress Banner */}
        {syncMessage && (
          <div className="animate-fade-in" style={{ 
            padding: '0.75rem 1rem', 
            borderRadius: '8px', 
            background: 'rgba(99, 102, 241, 0.1)', 
            border: '1px solid rgba(99, 102, 241, 0.2)',
            fontSize: '0.85rem',
            color: '#c7d2fe',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem'
          }}>
            <span className="animate-pulse" style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary-glow)' }}></span>
            {syncMessage}
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(99, 102, 241, 0.2)', borderRadius: '12px' }}>
            <BookOpen color="var(--primary-glow)" size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Learned Today</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{data?.count || 0} Topics</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(56, 189, 248, 0.2)', borderRadius: '12px' }}>
            <Activity color="var(--accent-color)" size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Current Streak</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>Active</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', border: dueTopics.length > 0 ? '1px solid rgba(239, 68, 68, 0.5)' : '' }}>
          <div style={{ padding: '1rem', background: dueTopics.length > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(168, 85, 247, 0.2)', borderRadius: '12px' }}>
            {dueTopics.length > 0 ? <AlertCircle color="#ef4444" size={24} /> : <Clock color="var(--secondary-glow)" size={24} />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Spaced Repetition</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{dueTopics.length} Due</div>
          </div>
          {dueTopics.length > 0 && (
            <Link to={`/quiz?topic=${encodeURIComponent(dueTopics[0])}`} className="btn-primary" style={{ textDecoration: 'none', padding: '6px 16px', fontSize: '0.85rem' }}>
              Review
            </Link>
          )}
        </div>
      </div>

      {/* Global Stats Row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '3rem' }}>
          <div className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
            <Database size={20} color="var(--primary-glow)" style={{ margin: '0 auto 0.5rem' }} />
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{stats.total_entries}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Total Entries</div>
          </div>
          <div className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
            <Video size={20} color="#ef4444" style={{ margin: '0 auto 0.5rem' }} />
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{stats.youtube}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Videos</div>
          </div>
          <div className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
            <BookOpen size={20} color="#f59e0b" style={{ margin: '0 auto 0.5rem' }} />
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{stats.leetcode}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>LeetCode</div>
          </div>
          <div className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
            <PenTool size={20} color="var(--accent-color)" style={{ margin: '0 auto 0.5rem' }} />
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{stats.manual}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Manual Notes</div>
          </div>
        </div>
      )}

      {/* Recent Entries */}
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Today's Summaries</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {data?.entries?.length === 0 ? (
          <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No summaries generated today. Watch some videos or wait for the 7:00 PM batch!
          </div>
        ) : (
          data?.entries?.map((entry, idx) => (
            <div key={idx} className="glass-card" style={{ padding: '1.5rem', display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
              {entry.source_type === 'youtube' && (
                <div style={{ 
                  width: '160px', height: '90px', borderRadius: '8px', 
                  background: 'rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' 
                }}>
                   {entry.source_url ? (
                     <img 
                       src={`https://img.youtube.com/vi/${entry.source_url.split('v=')[1]?.split('&')[0] || entry.source_url.split('/').pop()}/mqdefault.jpg`} 
                       alt="Thumbnail" 
                       style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                     />
                   ) : (
                     <Video color="rgba(255,255,255,0.2)" size={32} />
                   )}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', textTransform: 'uppercase' }}>
                    {entry.source_type}
                  </span>
                </div>
                <h3 style={{ marginBottom: '0.5rem', fontSize: '1.2rem' }}>{entry.title}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1rem', lineHeight: 1.6 }}>
                  {entry.summary}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {(entry.topics || []).map((t, i) => (
                    <span key={i} style={{ fontSize: '0.8rem', padding: '4px 10px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.15)', color: '#c7d2fe' }}>
                      #{String(t).trim()}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
