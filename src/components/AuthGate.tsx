import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import './styles.css';

export function AuthGate(props: { children: React.ReactNode }) {
  const { children } = props;

  const sb = supabase;

  const [session, setSession] = useState<any | null>(null);
  const [checking, setChecking] = useState(true);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!sb) return;

    let alive = true;

    (async () => {
      const { data } = await sb.auth.getSession();
      if (!alive) return;
      setSession(data.session ?? null);
      setChecking(false);
    })();

    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setChecking(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [sb]);

  if (!sb) {
    return (
      <div className="app">
        <h1>Ops & Production Dashboard</h1>
        <div className="card">
          <h3>Supabase not configured</h3>
          <div className="small">
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your deployment environment.
          </div>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="app">
        <h1>Ops & Production Dashboard</h1>
        <div className="card">Checking session…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app">
        <h1>Ops & Production Dashboard</h1>

        <div className="card">
          <h3>{mode === 'signin' ? 'Sign in' : 'Create account'}</h3>
          <div className="small">
            Use email + password to load/save data in Supabase (required for cross-device sync).
          </div>

          <label>
            Email
            <input value={email} placeholder="you@company.com" onChange={(e) => setEmail(e.target.value)} />
          </label>

          <label>
            Password
            <input
              value={password}
              type="password"
              placeholder="••••••••"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <div className="header">
            <button
              onClick={async () => {
                setErr(null);
                setMsg(null);
                try {
                  if (mode === 'signin') {
                    const { error } = await sb.auth.signInWithPassword({ email, password });
                    if (error) throw error;
                  } else {
                    const { error } = await sb.auth.signUp({ email, password });
if (error) throw error;

// Most Supabase configs require a separate sign-in to create a session
setMsg('Account created and confirmed. Now sign in with the same email + password.');
setMode('signin');
                  }
                } catch (e: any) {
                  setErr(e?.message ?? 'Auth failed');
                }
              }}
              disabled={!email.includes('@') || password.length < 6}
            >
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>

            <button
              onClick={() => {
                setErr(null);
                setMsg(null);
                setMode(mode === 'signin' ? 'signup' : 'signin');
              }}
            >
              {mode === 'signin' ? 'Need an account?' : 'Already have an account?'}
            </button>
          </div>

          {msg && (
            <div className="card" style={{ marginTop: 12 }}>
              <b>OK</b>
              <div className="small">{msg}</div>
            </div>
          )}

          {err && (
            <div className="card" style={{ marginTop: 12 }}>
              <b className="warn">Error</b>
              <div className="small">{err}</div>
            </div>
          )}

          <div className="hint" style={{ marginTop: 12 }}>
            Tip: If sign-in fails, confirm Email provider + Password auth is enabled in Supabase.
          </div>
        </div>
      </div>
    );
  }

  // Signed-in sticky banner
  return (
    <>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 9999,
          padding: '10px 12px',
          background: '#111',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.15)',
        }}
      >
        <div style={{ fontWeight: 700 }}>✅ Signed in</div>
        <button
          style={{
            padding: '6px 10px',
            borderRadius: 10,
            background: '#fff',
            color: '#111',
            border: 'none',
            cursor: 'pointer',
          }}
          onClick={async () => {
            await sb.auth.signOut();
            setSession(null);
          }}
        >
          Sign out
        </button>
      </div>

      {children}
    </>
  );
}
