import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, MonitorPlay } from 'lucide-react';
import { errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Field } from '../components/ui';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn(identifier.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Sign-in failed. Check your credentials and try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <h1 className="text-2xl font-semibold">Hybrid Learning LMS Portal</h1>
          <p className="mt-1 text-sm text-brand-100">
            Public Works Department, J&amp;K — R&amp;B Division Pahalgam
          </p>
        </div>

        <form onSubmit={onSubmit} className="card p-6">
          <h2 className="mb-5 text-lg font-semibold text-ink">Sign in</h2>

          {error && (
            <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <Field label="Email, username or mobile">
            <input
              className="input"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </Field>

          <Field label="Password">
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <Link to="/kiosk-login" className="btn-secondary w-full">
              <MonitorPlay className="h-4 w-4" aria-hidden />
              Sign in as a classroom panel
            </Link>
            <p className="mt-2 text-center text-xs text-slate-500">
              For shared interactive panels and OPS PCs in classrooms.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
