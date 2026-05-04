import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import { useAuth } from '@/lib/auth';
import Layout from './components/Layout';

const Login = lazy(() => import('./pages/Login'));
const Home = lazy(() => import('./pages/Home'));
const EvidenceUpload = lazy(() => import('./pages/EvidenceUpload'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const VerificationQueue = lazy(() => import('./pages/VerificationQueue'));
const SaferGreens = lazy(() => import('./pages/SaferGreens'));

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3B82F6] border-t-transparent" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0F19]">
        <PageLoader />
      </div>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public: Safer Greens marketing page */}
        <Route path="/safergreens" element={<SaferGreens />} />

        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/evidence" element={<EvidenceUpload />} />
                    <Route path="/portfolio" element={<Portfolio />} />
                    <Route path="/queue" element={<VerificationQueue />} />
                  </Routes>
                </Suspense>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}
