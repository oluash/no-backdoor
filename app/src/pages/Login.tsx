import { useState, type FC, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Eye, EyeOff, Loader } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const Login: FC = () => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await login(email, password);
        toast.success('Welcome back!');
      } else {
        await register(email, password, firstName, lastName);
        toast.success('Account created successfully!');
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0F19] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3B82F6]/10">
            <ShieldCheck className="h-7 w-7 text-[#3B82F6]" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[#F1F5F9]">
            No-Backdoor System
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Security verification platform
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-[#1E293B] bg-[#111827] p-6 shadow-xl">
          {/* Tabs */}
          <div className="mb-6 flex rounded-lg bg-[#0B0F19] p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all',
                  mode === m
                    ? 'bg-[#1A2235] text-[#F1F5F9] shadow-sm'
                    : 'text-[#64748B] hover:text-[#94A3B8]'
                )}
              >
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#F1F5F9]">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    placeholder="Jane"
                    className="w-full rounded-md border border-[#1E293B] bg-[#0B0F19] px-3.5 py-2.5 text-sm text-[#F1F5F9] placeholder-[#64748B] outline-none transition-colors focus:border-[#3B82F6] focus:ring-2 focus:ring-[rgba(59,130,246,0.15)]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#F1F5F9]">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    placeholder="Doe"
                    className="w-full rounded-md border border-[#1E293B] bg-[#0B0F19] px-3.5 py-2.5 text-sm text-[#F1F5F9] placeholder-[#64748B] outline-none transition-colors focus:border-[#3B82F6] focus:ring-2 focus:ring-[rgba(59,130,246,0.15)]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#F1F5F9]">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                className="w-full rounded-md border border-[#1E293B] bg-[#0B0F19] px-3.5 py-2.5 text-sm text-[#F1F5F9] placeholder-[#64748B] outline-none transition-colors focus:border-[#3B82F6] focus:ring-2 focus:ring-[rgba(59,130,246,0.15)]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#F1F5F9]">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="••••••••"
                  className="w-full rounded-md border border-[#1E293B] bg-[#0B0F19] px-3.5 py-2.5 pr-10 text-sm text-[#F1F5F9] placeholder-[#64748B] outline-none transition-colors focus:border-[#3B82F6] focus:ring-2 focus:ring-[rgba(59,130,246,0.15)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#94A3B8]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-[#3B82F6] px-4 py-2.5 text-sm font-medium text-[#0B0F19] transition-all hover:bg-[#2563EB] disabled:opacity-60"
            >
              {submitting && <Loader className="h-4 w-4 animate-spin" />}
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-[#64748B]">
          SOC 2 Type II Compliant &bull; Encrypted at rest
        </p>
      </motion.div>
    </div>
  );
};

export default Login;
