import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, MailCheck } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { Card, Field } from '../components/ui';

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <h1 className="text-2xl font-semibold">Hybrid Learning LMS Portal</h1>
          <p className="mt-1 text-sm text-brand-100">
            Public Works Department, J&amp;K — R&amp;B Division Pahalgam
          </p>
        </div>
        <Card>
          <h2 className="mb-5 text-lg font-semibold text-ink">{title}</h2>
          {children}
        </Card>
      </div>
    </div>
  );
}

/**
 * Requests a reset code. The response is deliberately identical whether or not
 * the account exists, so this page cannot be used to discover who has one.
 */
export function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');

  const request = useMutation({
    mutationFn: async () => (await api.post<any>('/auth/forgot-password', { identifier })).data,
  });

  return (
    <Shell title="Reset your password">
      {request.isSuccess ? (
        <>
          <div className="mb-4 flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <p>{request.data.message}</p>
          </div>
          <p className="mb-4 text-sm text-ink-soft">
            The code arrives by email or SMS. If it does not, ask your administrator to reset the
            password for you — they can do it from the Users screen.
          </p>
          <Link to="/reset-password" className="btn-primary w-full">
            I have a code
          </Link>
          <Link to="/login" className="btn-secondary mt-2 w-full">
            Back to sign in
          </Link>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            request.mutate();
          }}
        >
          <p className="mb-4 text-sm text-ink-soft">
            Enter the email or mobile number on your account and we will send a reset code.
          </p>

          <Field label="Email or mobile number">
            <input
              className="input"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoFocus
              required
            />
          </Field>

          {request.isError && (
            <p className="mb-3 text-sm text-red-600">{errorMessage(request.error)}</p>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={!identifier.trim() || request.isPending}
          >
            {request.isPending ? 'Sending…' : 'Send reset code'}
          </button>
          <Link to="/login" className="btn-secondary mt-2 w-full">
            Back to sign in
          </Link>
        </form>
      )}
    </Shell>
  );
}

/** Exchanges a reset code for a new password. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(params.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const reset = useMutation({
    mutationFn: async () =>
      (await api.post('/auth/reset-password', { token: token.trim(), newPassword: password })).data,
    onSuccess: () => setTimeout(() => navigate('/login'), 1500),
  });

  const mismatch = !!confirm && password !== confirm;

  return (
    <Shell title="Choose a new password">
      {reset.isSuccess ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">Password changed.</p>
          <p className="mt-1">
            All other devices have been signed out. Taking you to the sign-in screen…
          </p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            reset.mutate();
          }}
        >
          <Field label="Reset code" hint="From the email or SMS you were sent.">
            <input
              className="input"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoFocus={!token}
              required
            />
          </Field>

          <Field label="New password" hint="At least 8 characters.">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          <Field
            label="Confirm new password"
            error={mismatch ? 'The two passwords do not match.' : undefined}
          >
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </Field>

          {reset.isError && <p className="mb-3 text-sm text-red-600">{errorMessage(reset.error)}</p>}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={!token.trim() || password.length < 8 || mismatch || reset.isPending}
          >
            <KeyRound className="h-4 w-4" aria-hidden />
            {reset.isPending ? 'Saving…' : 'Set new password'}
          </button>
          <Link to="/login" className="btn-secondary mt-2 w-full">
            Back to sign in
          </Link>
        </form>
      )}
    </Shell>
  );
}
