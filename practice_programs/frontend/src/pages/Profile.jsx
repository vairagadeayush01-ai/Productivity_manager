/**
 * Profile.jsx — Onboarding + Connected Accounts page
 *
 * Sections:
 *   1. Identity      — display name, username (editable, saved on blur/submit)
 *   2. GitHub        — PAT + username input, validate → encrypt → store; disconnect
 *   3. LeetCode      — username input, validate → store; disconnect
 *   4. Extension     — install status + quick-start guide
 *   5. Last sync     — when data was last received from the extension
 *
 * API calls hit the backend profile routes:
 *   GET    /profile/
 *   PATCH  /profile/
 *   PUT    /profile/github
 *   DELETE /profile/github
 *   PUT    /profile/leetcode
 *   DELETE /profile/leetcode
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  User, GitBranch, Code2, Puzzle, RefreshCw, CheckCircle2,
  XCircle, AlertTriangle, Eye, EyeOff, Unlink, Link2,
  Clock, Zap, ChevronRight, Calendar,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function authHeaders() {
  const t = localStorage.getItem('pm_token');
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

async function apiFetch(path, options = {}) {
  const resp = await fetch(`${API}${path}`, { headers: authHeaders(), ...options });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.detail || data?.message || `HTTP ${resp.status}`);
  return data;
}

// ─── Small reusable pieces ────────────────────────────────────────────────────

function StatusBadge({ connected, label }) {
  return (
    <span className={`profile-badge ${connected ? 'profile-badge--connected' : 'profile-badge--disconnected'}`}>
      {connected
        ? <><CheckCircle2 size={11} aria-hidden /> {label || 'Connected'}</>
        : <><XCircle size={11} aria-hidden /> {label || 'Not connected'}</>
      }
    </span>
  );
}

function SectionCard({ icon: Icon, iconColor, iconBg, title, subtitle, connected, children }) {
  return (
    <div className={`profile-section${connected ? ' profile-section--connected' : ''}`}>
      <div className="profile-section__header">
        <div className="profile-section__icon" style={{ background: iconBg, color: iconColor }}>
          <Icon size={18} aria-hidden />
        </div>
        <div className="profile-section__meta">
          <h3 className="profile-section__title">{title}</h3>
          {subtitle && <p className="profile-section__sub">{subtitle}</p>}
        </div>
        {connected !== undefined && <StatusBadge connected={connected} />}
      </div>
      <div className="profile-section__body">{children}</div>
    </div>
  );
}

function FieldRow({ label, id, type = 'text', value, onChange, placeholder, hint, action, actionLabel, actionLoading, actionVariant = 'primary', disabled = false, secret = false }) {
  const [show, setShow] = useState(false);

  return (
    <div className="profile-field-group">
      {label && <label htmlFor={id} className="profile-field-label">{label}</label>}
      {hint && <p className="profile-field-hint">{hint}</p>}
      <div className="profile-field-row">
        <div className="profile-input-wrap">
          <input
            id={id}
            type={secret && !show ? 'password' : (type)}
            className="glass-input profile-input"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete={secret ? 'new-password' : undefined}
          />
          {secret && (
            <button
              type="button"
              className="profile-input-eye"
              onClick={() => setShow(s => !s)}
              tabIndex={-1}
              aria-label={show ? 'Hide' : 'Show'}
            >
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
        </div>
        {action && (
          <button
            type="button"
            className={actionVariant === 'danger' ? 'btn-danger' : 'btn-primary'}
            onClick={action}
            disabled={actionLoading || disabled}
          >
            {actionLoading
              ? <span className="animate-spin" style={{ display:'inline-block', width:14, height:14, border:'2px solid currentColor', borderTopColor:'transparent', borderRadius:'50%' }} />
              : actionLabel
            }
          </button>
        )}
      </div>
    </div>
  );
}

function StatusMessage({ type, message }) {
  if (!message) return null;
  return (
    <div className={`profile-status profile-status--${type}`} role={type === 'error' ? 'alert' : 'status'}>
      {type === 'success' && <CheckCircle2 size={13} aria-hidden />}
      {type === 'error'   && <AlertTriangle size={13} aria-hidden />}
      {message}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="profile-page">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="profile-section skeleton-pulse" style={{ minHeight: 120, marginBottom: '1rem' }} />
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Profile() {
  const { user } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Identity form
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername]     = useState('');
  const [identityStatus, setIdentityStatus] = useState({ type: '', msg: '' });
  const [identityLoading, setIdentityLoading] = useState(false);

  // GitHub form
  const [ghPat, setGhPat]       = useState('');
  const [ghUser, setGhUser]     = useState('');
  const [ghStatus, setGhStatus] = useState({ type: '', msg: '' });
  const [ghLoading, setGhLoading] = useState(false);

  // LeetCode form
  const [lcUser, setLcUser]     = useState('');
  const [lcStatus, setLcStatus] = useState({ type: '', msg: '' });
  const [lcLoading, setLcLoading] = useState(false);

  // ── Fetch profile ──────────────────────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/profile/');
      setProfile(data);
      setDisplayName(data.display_name || '');
      setUsername(data.username || '');
      setGhUser(data.github_username || '');
    } catch (e) {
      // Silently fail — page still shows empty forms
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    // Check for Google OAuth callback code
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setCalLoading(true);
      apiFetch('/calendar/callback', {
        method: 'POST',
        body: JSON.stringify({ code })
      }).then(() => {
        setCalStatus({ type: 'success', msg: 'Google Calendar connected successfully!' });
        window.history.replaceState({}, document.title, window.location.pathname);
        fetchProfile();
      }).catch(e => {
        setCalStatus({ type: 'error', msg: e.message });
      }).finally(() => {
        setCalLoading(false);
      });
    }
  }, [fetchProfile]);


  // ── Identity save ──────────────────────────────────────────────────────────
  const saveIdentity = async () => {
    setIdentityLoading(true);
    setIdentityStatus({ type: '', msg: '' });
    try {
      const data = await apiFetch('/profile/', {
        method: 'PATCH',
        body: JSON.stringify({ display_name: displayName, username: username || null }),
      });
      setProfile(data);
      setIdentityStatus({ type: 'success', msg: 'Profile updated!' });
    } catch (e) {
      setIdentityStatus({ type: 'error', msg: e.message });
    } finally {
      setIdentityLoading(false);
    }
  };

  // ── GitHub connect ─────────────────────────────────────────────────────────
  const connectGitHub = async () => {
    if (!ghPat.trim() || !ghUser.trim()) {
      setGhStatus({ type: 'error', msg: 'Enter both your GitHub username and PAT.' });
      return;
    }
    setGhLoading(true);
    setGhStatus({ type: '', msg: '' });
    try {
      const data = await apiFetch('/profile/github', {
        method: 'PUT',
        body: JSON.stringify({ pat: ghPat.trim(), username: ghUser.trim() }),
      });
      setProfile(data);
      setGhPat('');  // clear PAT field after save
      setGhStatus({ type: 'success', msg: `Connected as @${data.github_username}!` });
    } catch (e) {
      setGhStatus({ type: 'error', msg: e.message });
    } finally {
      setGhLoading(false);
    }
  };

  const disconnectGitHub = async () => {
    setGhLoading(true);
    setGhStatus({ type: '', msg: '' });
    try {
      await apiFetch('/profile/github', { method: 'DELETE' });
      setProfile(p => ({ ...p, github_connected: false, github_username: null }));
      setGhUser('');
      setGhStatus({ type: 'success', msg: 'GitHub disconnected.' });
    } catch (e) {
      setGhStatus({ type: 'error', msg: e.message });
    } finally {
      setGhLoading(false);
    }
  };

  // ── LeetCode connect ───────────────────────────────────────────────────────
  const connectLeetCode = async () => {
    if (!lcUser.trim()) {
      setLcStatus({ type: 'error', msg: 'Enter your LeetCode username.' });
      return;
    }
    setLcLoading(true);
    setLcStatus({ type: '', msg: '' });
    try {
      const data = await apiFetch('/profile/leetcode', {
        method: 'PUT',
        body: JSON.stringify({ username: lcUser.trim() }),
      });
      setProfile(data);
      setLcStatus({ type: 'success', msg: `Connected as ${data.leetcode_username}!` });
    } catch (e) {
      setLcStatus({ type: 'error', msg: e.message });
    } finally {
      setLcLoading(false);
    }
  };

  const disconnectLeetCode = async () => {
    setLcLoading(true);
    setLcStatus({ type: '', msg: '' });
    try {
      await apiFetch('/profile/leetcode', { method: 'DELETE' });
      setProfile(p => ({ ...p, leetcode_connected: false, leetcode_username: null }));
      setLcUser('');
      setLcStatus({ type: 'success', msg: 'LeetCode disconnected.' });
    } catch (e) {
      setLcStatus({ type: 'error', msg: e.message });
    } finally {
      setLcLoading(false);
    }
  };

  // ── Calendar connect ───────────────────────────────────────────────────────
  const [calStatus, setCalStatus] = useState({ type: '', msg: '' });
  const [calLoading, setCalLoading] = useState(false);

  const connectCalendar = async () => {
    setCalLoading(true);
    setCalStatus({ type: '', msg: '' });
    try {
      const data = await apiFetch('/calendar/auth');
      window.location.href = data.url;
    } catch (e) {
      setCalStatus({ type: 'error', msg: e.message });
      setCalLoading(false);
    }
  };

  const disconnectCalendar = async () => {
    setCalLoading(true);
    setCalStatus({ type: '', msg: '' });
    try {
      await apiFetch('/calendar/disconnect', { method: 'DELETE' });
      setProfile(p => ({ ...p, calendar_connected: false }));
      setCalStatus({ type: 'success', msg: 'Google Calendar disconnected.' });
    } catch (e) {
      setCalStatus({ type: 'error', msg: e.message });
    } finally {
      setCalLoading(false);
    }
  };


  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <ProfileSkeleton />;

  const ghConnected = profile?.github_connected;
  const lcConnected = profile?.leetcode_connected;
  const calConnected = profile?.calendar_connected;
  const extInstalled = profile?.extension_installed;
  const lastSync = profile?.last_sync_at
    ? new Date(profile.last_sync_at).toLocaleString()
    : null;

  return (
    <div className="page page--narrow animate-fade-in profile-page">

      {/* Page header */}
      <div className="profile-hero">
        <div className="profile-hero__avatar">
          {(profile?.display_name || user?.email || '?')[0].toUpperCase()}
        </div>
        <div className="profile-hero__info">
          <h1 className="profile-hero__name">
            {profile?.display_name || profile?.username || user?.email?.split('@')[0] || 'Your profile'}
          </h1>
          <p className="profile-hero__email">{user?.email}</p>
          {lastSync && (
            <p className="profile-hero__sync">
              <Clock size={12} aria-hidden />
              Last sync: {lastSync}
            </p>
          )}
        </div>
        <div className="profile-hero__badges">
          {ghConnected  && <div className="profile-pill profile-pill--gh"><GitBranch size={11} />GitHub</div>}
          {lcConnected  && <div className="profile-pill profile-pill--lc"><Code2 size={11} />LeetCode</div>}
          {calConnected && <div className="profile-pill profile-pill--ext" style={{color:'#DB4437', borderColor:'#DB4437', background:'rgba(219,68,55,0.1)'}}><Calendar size={11} />Calendar</div>}
          {extInstalled && <div className="profile-pill profile-pill--ext"><Puzzle size={11} />Extension</div>}
        </div>
      </div>

      {/* ── 1. Identity ─────────────────────────────────────────────────── */}
      <SectionCard
        icon={User}
        iconColor="#6366F1"
        iconBg="rgba(99,102,241,0.10)"
        title="Identity"
        subtitle="How you appear in reports and your diary"
      >
        <div className="profile-two-col">
          <FieldRow
            id="display-name"
            label="Display name"
            placeholder="e.g. Ayush"
            value={displayName}
            onChange={setDisplayName}
          />
          <FieldRow
            id="username"
            label="Username"
            placeholder="e.g. ayush_dev"
            value={username}
            onChange={setUsername}
            hint="Letters, numbers, _ and - only"
          />
        </div>
        <div className="profile-section__footer">
          <StatusMessage {...{ type: identityStatus.type, message: identityStatus.msg }} />
          <button
            type="button"
            className="btn-primary btn-primary--sm"
            onClick={saveIdentity}
            disabled={identityLoading}
          >
            {identityLoading
              ? <><RefreshCw size={13} className="animate-spin" /> Saving…</>
              : 'Save changes'
            }
          </button>
        </div>
      </SectionCard>

      {/* ── 2. GitHub ───────────────────────────────────────────────────── */}
      <SectionCard
        icon={GitBranch}
        iconColor="#24292F"
        iconBg="rgba(36,41,47,0.08)"
        title="GitHub"
        subtitle="Enables commit diff analysis and semantic code intelligence"
        connected={ghConnected}
      >
        {ghConnected ? (
          <div className="profile-connected-row">
            <div className="profile-connected-info">
              <GitBranch size={16} aria-hidden />
              <div>
                <strong>@{profile.github_username}</strong>
                <p className="profile-field-hint">PAT stored encrypted. Commits synced via /github/sync.</p>
              </div>
            </div>
            <button
              type="button"
              className="btn-danger btn-danger--sm"
              onClick={disconnectGitHub}
              disabled={ghLoading}
            >
              <Unlink size={13} aria-hidden /> Disconnect
            </button>
          </div>
        ) : (
          <>
            <div className="profile-two-col">
              <FieldRow
                id="gh-username"
                label="GitHub username"
                placeholder="octocat"
                value={ghUser}
                onChange={setGhUser}
              />
              <FieldRow
                id="gh-pat"
                label="Personal Access Token"
                placeholder="ghp_xxxxxxxxxxxx"
                value={ghPat}
                onChange={setGhPat}
                secret
                hint={
                  <span>
                    Need a PAT?{' '}
                    <a
                      href="https://github.com/settings/tokens/new?description=Antigravity&scopes=repo,read:user"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="profile-link"
                    >
                      Generate one here
                    </a>{' '}
                    (requires <code>repo</code> + <code>read:user</code> scopes)
                  </span>
                }
              />
            </div>
            <div className="profile-section__footer">
              <StatusMessage type={ghStatus.type} message={ghStatus.msg} />
              <button
                type="button"
                className="btn-primary btn-primary--sm"
                onClick={connectGitHub}
                disabled={ghLoading}
              >
                {ghLoading
                  ? <><RefreshCw size={13} className="animate-spin" /> Validating…</>
                  : <><Link2 size={13} aria-hidden /> Connect GitHub</>
                }
              </button>
            </div>
          </>
        )}
        {ghStatus.msg && ghConnected && (
          <StatusMessage type={ghStatus.type} message={ghStatus.msg} />
        )}
      </SectionCard>

      {/* ── 3. LeetCode ─────────────────────────────────────────────────── */}
      <SectionCard
        icon={Code2}
        iconColor="#FFA116"
        iconBg="rgba(255,161,22,0.10)"
        title="LeetCode"
        subtitle="Enables solution capture, complexity analysis, and pattern tracking"
        connected={lcConnected}
      >
        {lcConnected ? (
          <div className="profile-connected-row">
            <div className="profile-connected-info">
              <Code2 size={16} aria-hidden style={{ color: '#FFA116' }} />
              <div>
                <strong>{profile.leetcode_username}</strong>
                <p className="profile-field-hint">Username validated. Solutions captured via the extension.</p>
              </div>
            </div>
            <button
              type="button"
              className="btn-danger btn-danger--sm"
              onClick={disconnectLeetCode}
              disabled={lcLoading}
            >
              <Unlink size={13} aria-hidden /> Disconnect
            </button>
          </div>
        ) : (
          <>
            <FieldRow
              id="lc-username"
              label="LeetCode username"
              placeholder="e.g. ayush_vairagade"
              value={lcUser}
              onChange={v => { setLcUser(v); setProfile(p => ({ ...p, leetcode_username: null })); }}
            />
            <div className="profile-section__footer">
              <StatusMessage type={lcStatus.type} message={lcStatus.msg} />
              <button
                type="button"
                className="btn-primary btn-primary--sm"
                onClick={connectLeetCode}
                disabled={lcLoading}
              >
                {lcLoading
                  ? <><RefreshCw size={13} className="animate-spin" /> Validating…</>
                  : <><Link2 size={13} aria-hidden /> Connect LeetCode</>
                }
              </button>
            </div>
          </>
        )}
        {lcStatus.msg && lcConnected && (
          <StatusMessage type={lcStatus.type} message={lcStatus.msg} />
        )}
      </SectionCard>

      {/* ── Google Calendar ─────────────────────────────────────────────────── */}
      <SectionCard
        icon={Calendar}
        iconColor="#DB4437"
        iconBg="rgba(219,68,55,0.10)"
        title="Google Calendar"
        subtitle="Enables NLP-powered study scheduling and event syncing"
        connected={calConnected}
      >
        {calConnected ? (
          <div className="profile-connected-row">
            <div className="profile-connected-info">
              <Calendar size={16} aria-hidden style={{ color: '#DB4437' }} />
              <div>
                <strong>Connected to Google</strong>
                <p className="profile-field-hint">OAuth token securely stored. Go to the Planner to schedule.</p>
              </div>
            </div>
            <button
              type="button"
              className="btn-danger btn-danger--sm"
              onClick={disconnectCalendar}
              disabled={calLoading}
            >
              <Unlink size={13} aria-hidden /> Disconnect
            </button>
          </div>
        ) : (
          <>
            <div className="profile-section__footer" style={{ borderTop: 'none', paddingTop: 0 }}>
              <StatusMessage type={calStatus.type} message={calStatus.msg} />
              <button
                type="button"
                className="btn-primary btn-primary--sm"
                onClick={connectCalendar}
                disabled={calLoading}
              >
                {calLoading
                  ? <><RefreshCw size={13} className="animate-spin" /> Redirecting…</>
                  : <><Link2 size={13} aria-hidden /> Connect Google Calendar</>
                }
              </button>
            </div>
          </>
        )}
        {calStatus.msg && calConnected && (
          <StatusMessage type={calStatus.type} message={calStatus.msg} />
        )}
      </SectionCard>

      {/* ── 4. Extension ────────────────────────────────────────────────── */}
      <SectionCard
        icon={Puzzle}
        iconColor="#8B5CF6"
        iconBg="rgba(139,92,246,0.10)"
        title="Browser extension"
        subtitle="Captures YouTube watch sessions and LeetCode solutions offline-first"
        connected={extInstalled}
      >
        {extInstalled ? (
          <div className="profile-ext-ok">
            <Zap size={18} color="var(--success)" aria-hidden />
            <div>
              <strong>Extension is active</strong>
              <p className="profile-field-hint">YouTube + LeetCode capture is running in the background.</p>
            </div>
          </div>
        ) : (
          <div className="profile-ext-guide">
            <p className="profile-field-hint" style={{ marginBottom: '0.75rem' }}>
              Install the Antigravity extension to automatically capture YouTube learning sessions and LeetCode accepted solutions — even when you're offline.
            </p>
            <ol className="profile-steps">
              <li><ChevronRight size={12} aria-hidden /> Open <code>chrome://extensions</code> in Chrome</li>
              <li><ChevronRight size={12} aria-hidden /> Enable <strong>Developer mode</strong> (top right toggle)</li>
              <li><ChevronRight size={12} aria-hidden /> Click <strong>Load unpacked</strong> → select the <code>youtube-ai-extension/</code> folder</li>
              <li><ChevronRight size={12} aria-hidden /> Log in via the extension popup to link your account</li>
            </ol>
          </div>
        )}
      </SectionCard>

    </div>
  );
}
