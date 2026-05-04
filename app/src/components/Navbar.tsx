import { useState, useRef, useEffect } from 'react';
import type { FC } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Bell, Menu, X, Settings, LogOut, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

interface NavItem {
  label: string;
  path: string;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/' },
  { label: 'Evidence Upload', path: '/evidence' },
  { label: 'Portfolio', path: '/portfolio' },
  { label: 'Verification Queue', path: '/queue' },
];

const notifications = [
  {
    id: 1,
    title: 'Payment Gateway v2.3 verified',
    description: 'All security checks passed successfully',
    time: '2h ago',
    severity: 'verified' as const,
    unread: true,
  },
  {
    id: 2,
    title: 'New threat detected',
    description: 'Legacy Import Tool failed dynamic scan',
    time: '5h ago',
    severity: 'threat' as const,
    unread: true,
  },
  {
    id: 3,
    title: 'Code audit uploaded',
    description: 'api-gateway-scan-results.zip received',
    time: '8h ago',
    severity: 'neutral' as const,
    unread: false,
  },
];

const severityColors = {
  verified: 'bg-[#10B981]',
  threat: 'bg-[#EF4444]',
  pending: 'bg-[#F59E0B]',
  neutral: 'bg-[#3B82F6]',
};

const Navbar: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter((n) => n.unread).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
      if (userRef.current && !userRef.current.contains(event.target as Node)) {
        setUserOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user
    ? `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}`.toUpperCase()
    : '?';

  return (
    <>
      <nav className="fixed top-0 z-50 h-[60px] w-full border-b border-[#1E293B] bg-[rgba(11,15,25,0.85)] backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-container items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Left: Hamburger (mobile) + Brand */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex h-9 w-9 items-center justify-center text-[#64748B] transition-colors hover:text-[#F1F5F9] md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6" />
            </button>
            <NavLink to="/" className="group flex items-center gap-2.5">
              <ShieldCheck className="h-6 w-6 text-[#10B981] transition-transform duration-200 group-hover:rotate-[5deg]" />
              <span className="text-base font-semibold tracking-tight text-[#F1F5F9]">
                No-Backdoor
              </span>
            </NavLink>
          </div>

          {/* Center: Nav Links (desktop) */}
          <div className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const isActive =
                item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'relative px-4 py-2 text-sm font-medium transition-colors duration-150',
                    isActive ? 'text-[#F1F5F9]' : 'text-[#64748B] hover:text-[#94A3B8]'
                  )}
                >
                  {item.label}
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute bottom-0 left-1/2 h-0.5 w-6 -translate-x-1/2 bg-[#3B82F6]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </NavLink>
              );
            })}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            {/* Notification Bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => {
                  setNotifOpen(!notifOpen);
                  setUserOpen(false);
                }}
                className="relative flex h-9 w-9 items-center justify-center text-[#64748B] transition-colors hover:text-[#F1F5F9]"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-medium text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="absolute right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[10px] border border-[#1E293B] bg-[#111827] shadow-dropdown"
                  >
                    <div className="flex items-center justify-between border-b border-[#1E293B] px-4 py-3">
                      <h3 className="text-sm font-semibold text-[#F1F5F9]">Notifications</h3>
                      {unreadCount > 0 && (
                        <span className="rounded-full bg-[rgba(59,130,246,0.12)] px-2 py-0.5 text-xs font-medium text-[#3B82F6]">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="max-h-[380px] overflow-y-auto">
                      {notifications.map((notif) => (
                        <button
                          key={notif.id}
                          className={cn(
                            'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#1A2235]',
                            notif.unread ? 'bg-[#1A2235]' : 'bg-transparent'
                          )}
                          onClick={() => setNotifOpen(false)}
                        >
                          <span className={cn('mt-1.5 h-1 w-1 shrink-0 rounded-full', severityColors[notif.severity])} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-[#F1F5F9]">{notif.title}</p>
                            <p className="mt-0.5 text-xs text-[#64748B]">{notif.description}</p>
                            <p className="mt-1 font-mono text-xs text-[#64748B]">{notif.time}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* User Avatar */}
            <div className="relative" ref={userRef}>
              <button
                onClick={() => {
                  setUserOpen(!userOpen);
                  setNotifOpen(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1E293B] bg-[#1A2235] text-xs font-medium text-[#F1F5F9] transition-colors hover:border-[#334155]"
                aria-label="User menu"
              >
                {initials || <User className="h-4 w-4 text-[#94A3B8]" />}
              </button>

              <AnimatePresence>
                {userOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="absolute right-0 top-full mt-2 w-[220px] overflow-hidden rounded-[10px] border border-[#1E293B] bg-[#111827] shadow-dropdown"
                  >
                    {/* User info header */}
                    <div className="border-b border-[#1E293B] px-4 py-3">
                      <p className="text-sm font-medium text-[#F1F5F9]">
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="mt-0.5 text-xs text-[#64748B]">{user?.email}</p>
                      <span className="mt-1 inline-block rounded bg-[rgba(59,130,246,0.12)] px-2 py-0.5 text-xs font-medium text-[#3B82F6]">
                        {user?.role}
                      </span>
                    </div>
                    <div className="p-2">
                      <button className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-[#F1F5F9] transition-colors hover:bg-[#1A2235]">
                        <User className="h-4 w-4 text-[#94A3B8]" />
                        Profile
                      </button>
                      <button className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-[#F1F5F9] transition-colors hover:bg-[#1A2235]">
                        <Settings className="h-4 w-4 text-[#94A3B8]" />
                        Settings
                      </button>
                      <div className="my-1 border-t border-[#1E293B]" />
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-[#EF4444] transition-colors hover:bg-[#1A2235]"
                      >
                        <LogOut className="h-4 w-4" />
                        Log Out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
              className="fixed left-0 top-0 z-50 flex h-full w-[280px] flex-col border-r border-[#1E293B] bg-[#111827] shadow-drawer"
            >
              <div className="flex items-center justify-between px-5 py-4">
                <NavLink to="/" className="flex items-center gap-2.5">
                  <ShieldCheck className="h-6 w-6 text-[#10B981]" />
                  <span className="text-base font-semibold text-[#F1F5F9]">No-Backdoor</span>
                </NavLink>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="flex h-8 w-8 items-center justify-center text-[#64748B] hover:text-[#F1F5F9]"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 px-3 py-2">
                {navItems.map((item) => {
                  const isActive =
                    item.path === '/'
                      ? location.pathname === '/'
                      : location.pathname.startsWith(item.path);
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={cn(
                        'flex h-12 items-center rounded-lg px-4 text-sm font-medium transition-colors',
                        isActive
                          ? 'border-l-[3px] border-[#3B82F6] bg-[#1A2235] text-[#F1F5F9]'
                          : 'border-l-[3px] border-transparent text-[#64748B] hover:bg-[#1A2235] hover:text-[#94A3B8]'
                      )}
                    >
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
              <div className="border-t border-[#1E293B] px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1E293B] bg-[#1A2235] text-xs font-medium text-[#F1F5F9]">
                    {initials || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#F1F5F9]">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs text-[#64748B]">{user?.email}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
