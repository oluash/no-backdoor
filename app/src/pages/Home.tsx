import { useState, useEffect, useCallback } from 'react';
import type { FC } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Clock,
  AlertTriangle,
  Layers,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Upload,
  Briefcase,
  ListTodo,
  ScanLine,
  ChevronRight,
  Play,
  X,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import StatusBadge from '@/components/StatusBadge';
import { dashboardApi, systemsApi, queueApi, type MetricsSummary, type TrendPoint, type StatusBreakdown, type ActivityItem } from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  Sparkline Component                                                */
/* ------------------------------------------------------------------ */

interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

const Sparkline: FC<SparklineProps> = ({ data, color, width = 80, height = 28 }) => {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const pathD = `M ${points.join(' L ')}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Custom Recharts Tooltip                                            */
/* ------------------------------------------------------------------ */

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

const CustomTooltip: FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#1A2235] px-3 py-2 shadow-dropdown">
      <p className="mb-1.5 font-mono text-xs text-[#94A3B8]">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-xs text-[#94A3B8]">{entry.name}:</span>
          <span className="font-mono text-xs text-[#F1F5F9]">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                 */
/* ------------------------------------------------------------------ */

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
};

const fadeScale = {
  hidden: { opacity: 0, scale: 0.97 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

const slideLeft = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

/* ------------------------------------------------------------------ */
/*  Main Dashboard Page                                                */
/* ------------------------------------------------------------------ */

const Home: FC = () => {
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);

  // Live data state
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<StatusBreakdown[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [s, t, sb, a] = await Promise.all([
        dashboardApi.summary(),
        dashboardApi.trends(),
        dashboardApi.status(),
        dashboardApi.recentActivity(1, 6),
      ]);
      setSummary(s);
      setTrends(t);
      setStatusBreakdown(sb);
      setActivities(a);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData().finally(() => setTimeout(() => setRefreshing(false), 400));
  }, [fetchData]);

  // Derive chart data from live API
  const trendChartData = trends.reduce<Record<string, any>>((acc, t) => {
    const date = t.date?.slice(0, 10) || t.date;
    if (!acc[date]) acc[date] = { date };
    acc[date][t.status] = (acc[date][t.status] || 0) + t.count;
    return acc;
  }, {});

  const trendChartArray = Object.values(trendChartData);

  const statusDonutColors: Record<string, string> = {
    verified: '#10B981',
    pending: '#F59E0B',
    threat: '#EF4444',
    unknown: '#64748B',
  };

  const donutData = statusBreakdown.length > 0
    ? statusBreakdown.map((s) => ({
        name: s.status.charAt(0).toUpperCase() + s.status.slice(1),
        value: Number(s.count),
        color: statusDonutColors[s.status] || '#64748B',
      }))
    : [];

  // Build activity items from API
  const activityItems = activities.map((a) => ({
    id: a.id,
    icon: a.action === 'verified' ? ShieldCheck : a.action === 'upload' ? Upload : a.action === 'threat' ? AlertTriangle : Clock,
    color: a.action === 'verified' ? '#10B981' : a.action === 'upload' ? '#3B82F6' : a.action === 'threat' ? '#EF4444' : '#F59E0B',
    title: a.metadata?.title || `${a.action} on ${a.entity_type}`,
    subtitle: a.metadata?.description || `by ${a.first_name} ${a.last_name}`,
    badge: (a.metadata?.badge as string) || a.action,
    badgeVariant: (a.metadata?.badgeVariant as 'verified' | 'pending' | 'threat' | 'neutral') || 'neutral',
    time: formatRelativeTime(a.created_at),
  }));

  const quickActions = [
    { icon: Upload, color: '#3B82F6', bgColor: 'rgba(59,130,246,0.1)', title: 'Upload Evidence', description: 'Submit code scans, audits, and reports', route: '/evidence' },
    { icon: Briefcase, color: '#10B981', bgColor: 'rgba(16,185,129,0.1)', title: 'View Portfolio', description: 'Browse verified systems and products', route: '/portfolio' },
    { icon: ListTodo, color: '#F59E0B', bgColor: 'rgba(245,158,11,0.1)', title: 'Check Queue', description: 'Manage pending verifications', route: '/queue' },
    { icon: ScanLine, color: '#94A3B8', bgColor: 'rgba(148,163,184,0.1)', title: 'Run New Scan', description: 'Initiate a fresh security verification', route: null },
  ];

  if (loading) {
    return (
      <div className="mx-auto max-w-container px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3B82F6] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-container px-4 pb-12 pt-5 sm:px-6 lg:px-8">
      {/* ── Page Header ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-[#F1F5F9]">Security Overview</h1>
          <p className="mt-2 text-base text-[#94A3B8]">Real-time visibility into your software security posture</p>
        </div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1, duration: 0.3 }} className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[#64748B]">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-mono text-xs">Live data</span>
          </div>
          <button
            onClick={handleRefresh}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#94A3B8] transition-colors hover:bg-[#1A2235] hover:text-[#F1F5F9]"
            aria-label="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} style={{ animationDuration: '600ms' }} />
          </button>
        </motion.div>
      </motion.div>

      {/* ── Key Metrics ── */}
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <motion.div variants={fadeUp} className="group rounded-[10px] border border-[#1E293B] bg-[#111827] p-6 transition-all duration-250 hover:-translate-y-0.5 hover:border-[#334155] hover:shadow-card">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#10B981]" />
              <span className="text-xs font-medium uppercase tracking-wider text-[#64748B]">Verified Systems</span>
            </div>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="font-mono text-3xl text-[#10B981]">{summary?.verifiedSystems || 0}</p>
            </div>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="group rounded-[10px] border border-[#1E293B] bg-[#111827] p-6 transition-all duration-250 hover:-translate-y-0.5 hover:border-[#334155] hover:shadow-card">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#F59E0B]" />
              <span className="text-xs font-medium uppercase tracking-wider text-[#64748B]">Pending Reviews</span>
            </div>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="font-mono text-3xl text-[#F59E0B]">{summary?.pendingReviews || 0}</p>
            </div>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="group rounded-[10px] border border-[#1E293B] bg-[#111827] p-6 transition-all duration-250 hover:-translate-y-0.5 hover:border-[#334155] hover:shadow-card">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[#EF4444]" />
              <span className="text-xs font-medium uppercase tracking-wider text-[#64748B]">Active Threats</span>
            </div>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="font-mono text-3xl text-[#EF4444]">{summary?.activeThreats || 0}</p>
            </div>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="group rounded-[10px] border border-[#1E293B] bg-[#111827] p-6 transition-all duration-250 hover:-translate-y-0.5 hover:border-[#334155] hover:shadow-card">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-[#3B82F6]" />
              <span className="text-xs font-medium uppercase tracking-wider text-[#64748B]">Queue Depth</span>
            </div>
          </div>
          <div className="mt-4">
            <p className="font-mono text-3xl text-[#3B82F6]">{summary?.queueDepth || 0}</p>
            <p className="mt-1 text-xs text-[#94A3B8]">{summary?.totalTasks || 0} total tasks</p>
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[#1E293B]">
              <div
                className="h-full rounded-full bg-[#3B82F6]"
                style={{ width: `${summary?.totalTasks ? Math.min(100, ((summary.queueDepth || 0) / summary.totalTasks) * 100) : 0}%` }}
              />
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* ── Charts Row ── */}
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <motion.div variants={fadeScale} className="rounded-[10px] border border-[#1E293B] bg-[#111827] p-6 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-[#F1F5F9]">Verification Trend</h2>
            <span className="text-xs text-[#64748B]">Last 30 days</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trendChartArray.length > 0 ? trendChartArray : [{ date: 'No data', verified: 0, pending: 0, threats: 0 }]}>
              <defs>
                <linearGradient id="gradVerified" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradPending" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradThreats" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 12, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748B', fontSize: 12, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="verified" stroke="#10B981" strokeWidth={2} fill="url(#gradVerified)" />
              <Area type="monotone" dataKey="pending" stroke="#F59E0B" strokeWidth={2} fill="url(#gradPending)" />
              <Area type="monotone" dataKey="threats" stroke="#EF4444" strokeWidth={2} fill="url(#gradThreats)" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div variants={fadeScale} className="rounded-[10px] border border-[#1E293B] bg-[#111827] p-6 lg:col-span-2">
          <h2 className="mb-4 text-xl font-semibold text-[#F1F5F9]">System Status</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={donutData.length > 0 ? donutData : [{ name: 'No Data', value: 100, color: '#1E293B' }]}
                cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" paddingAngle={2} dataKey="value" stroke="#111827" strokeWidth={2}
              >
                {donutData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
            {donutData.map((item) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-[#94A3B8]">{item.name}</span>
                <span className="font-mono text-xs text-[#F1F5F9]">{item.value}%</span>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* ── Recent Activity ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.3 }} className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[#F1F5F9]">Recent Activity</h2>
          <button className="flex items-center gap-1 text-xs text-[#3B82F6] transition-colors hover:underline">
            View All <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <motion.div variants={staggerContainer} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} className="flex flex-col gap-3">
          {activityItems.length > 0 ? activityItems.map((item) => {
            const IconComp = item.icon;
            return (
              <motion.div
                key={item.id}
                variants={slideLeft}
                className="group flex items-center gap-4 rounded-lg border border-[#1E293B] bg-[#111827] px-5 py-4 transition-colors hover:bg-[#1A2235]"
                style={{ borderLeftWidth: 3, borderLeftColor: item.color }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${item.color}1A` }}>
                  <IconComp className="h-4 w-4" style={{ color: item.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[#F1F5F9]">{item.title}</p>
                  <p className="mt-0.5 truncate text-xs text-[#64748B]">{item.subtitle}</p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <StatusBadge variant={item.badgeVariant}>{item.badge}</StatusBadge>
                  <span className="hidden font-mono text-xs text-[#64748B] sm:inline">{item.time}</span>
                </div>
              </motion.div>
            );
          }) : (
            <div className="flex flex-col items-center py-12 text-[#64748B]">
              <Clock className="mb-3 h-10 w-10" />
              <p className="text-sm">No recent activity</p>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* ── Quick Actions ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.3 }}>
        <h2 className="mb-5 text-xl font-semibold text-[#F1F5F9]">Quick Actions</h2>
        <motion.div variants={staggerContainer} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action) => {
            const IconComp = action.icon;
            return (
              <motion.button
                key={action.title}
                variants={scaleIn}
                onClick={() => (action.route ? navigate(action.route) : setScanModalOpen(true))}
                className="group flex flex-col items-center rounded-[10px] border border-[#1E293B] bg-[#111827] p-6 text-center transition-all duration-250 hover:-translate-y-0.5 hover:border-[#334155] hover:shadow-card"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: action.bgColor }}>
                  <IconComp className="h-6 w-6" style={{ color: action.color }} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-[#F1F5F9]">{action.title}</h3>
                <p className="mt-1 text-xs text-[#94A3B8]">{action.description}</p>
              </motion.button>
            );
          })}
        </motion.div>
      </motion.div>

      {/* ── Scan Modal ── */}
      {scanModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[rgba(0,0,0,0.6)] backdrop-blur-sm" onClick={() => setScanModalOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-[640px] rounded-xl border border-[#1E293B] bg-[#111827] p-6 shadow-modal"
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-[#F1F5F9]">New Security Verification</h3>
              <button onClick={() => setScanModalOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-md text-[#64748B] hover:bg-[#1A2235] hover:text-[#F1F5F9]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-5 text-sm text-[#94A3B8]">Configure and launch a new verification scan.</p>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#F1F5F9]">System Name</label>
                <input type="text" placeholder="e.g., Payment Gateway" className="w-full rounded-md border border-[#1E293B] bg-[#0E1525] px-3.5 py-2.5 text-sm text-[#F1F5F9] placeholder-[#64748B] outline-none transition-colors focus:border-[#3B82F6] focus:ring-2 focus:ring-[rgba(59,130,246,0.15)]" />
              </div>
              <div className="w-2/5">
                <label className="mb-1.5 block text-sm font-medium text-[#F1F5F9]">Version</label>
                <input type="text" placeholder="e.g., v2.3.1" className="w-full rounded-md border border-[#1E293B] bg-[#0E1525] px-3.5 py-2.5 text-sm text-[#F1F5F9] placeholder-[#64748B] outline-none transition-colors focus:border-[#3B82F6] focus:ring-2 focus:ring-[rgba(59,130,246,0.15)]" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#F1F5F9]">Scan Type</label>
                <select className="w-full rounded-md border border-[#1E293B] bg-[#0E1525] px-3.5 py-2.5 text-sm text-[#F1F5F9] outline-none transition-colors focus:border-[#3B82F6] focus:ring-2 focus:ring-[rgba(59,130,246,0.15)]">
                  <option>Full Verification</option>
                  <option>Static Analysis Only</option>
                  <option>Dynamic Analysis Only</option>
                  <option>Dependency Audit</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#F1F5F9]">Priority</label>
                <div className="flex gap-3">
                  {['Normal', 'High', 'Critical'].map((p) => (
                    <label key={p} className="flex items-center gap-2">
                      <input type="radio" name="priority" value={p} defaultChecked={p === 'Normal'} className="h-4 w-4 accent-[#3B82F6]" />
                      <span className="text-sm text-[#F1F5F9]">{p}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setScanModalOpen(false)} className="rounded-md border border-[#1E293B] bg-[#1A2235] px-5 py-2.5 text-sm font-medium text-[#F1F5F9] transition-colors hover:border-[#334155]">Cancel</button>
              <button onClick={() => setScanModalOpen(false)} className="flex items-center gap-2 rounded-md bg-[#3B82F6] px-5 py-2.5 text-sm font-medium text-[#0B0F19] transition-all hover:-translate-y-px hover:bg-[#2563EB] hover:shadow-[0_4px_12px_rgba(59,130,246,0.25)]">
                <Play className="h-4 w-4" /> Launch Scan
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

/* ── Helper ── */
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default Home;
