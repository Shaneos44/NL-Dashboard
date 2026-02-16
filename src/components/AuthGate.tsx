import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import './styles.css';

export function AuthGate(props: { children: React.ReactNode }) {
  const { children } = props;

  const sb = supabase; // <— component-scope alias (can be null)

  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!sb) return;

    sb.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => sub.subscription.unsubscribe();
  }, [sb]);

  // If supabase is not configured at build/runtime, block and show instructions
  if (!sb) {
    return (
      <div className="app">
        <h1>Ops & Production Dashboard</h1>
        <div className="card">
          <h3>Supabase not configured</h3>
          <div className="small">
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your GitHub Pages build
            environment. This app requires Supabase Auth to load/save data.
          </div>
        </div>
      </div>
    );
  }

  // Not signed in yet → show login screen
  if (!session) {
    return (
      <div className="app">
        <h1>Ops & Production Dashboard</h1>
        <div className="card">
          <h3>Sign in</h3>
          <div className="small">
            This dashboard uses Supabase Auth. Sign in to load/save your data across devices.
          </div>

          <label>
            Email
            <input
              value={email}
              placeholder="you@company.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <button
            onClick={async () => {
              setErr(null);
              setSent(false);
              try {
                const { error } = await sb.auth.signInWithOtp({
                  email,
                  options: {
                    // GitHub Pages safe redirect (must also be whitelisted in Supabase Auth settings)
                    emailRedirectTo: window.location.origin + window.location.pathname,
                  },
                });
                if (error) throw error;
                setSent(true);
              } catch (e: any) {
                setErr(e?.message ?? 'Failed to send magic link');
              }
            }}
            disabled={!email.includes('@')}
          >
            Send magic link
          </button>

          {sent && (
            <div className="card" style={{ marginTop: 12 }}>
              <b>Check your email</b>
              <div className="small">Open the link to complete sign-in, then return here.</div>
            </div>
          )}

          {err && (
            <div className="card" style={{ marginTop: 12 }}>
              <b className="warn">Error</b>
              <div className="small">{err}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Signed in → render app
  return (
    <>
      <div className="small" style={{ marginBottom: 8 }}>
        Signed in ·{' '}
        <button
          onClick={async () => {
            await sb.auth.signOut();
          }}
        >
          Sign out
        </button>
      </div>
      {children}
    </>
  );
}
