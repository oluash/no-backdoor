import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import { Toaster } from 'sonner';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import './index.css';
import App from './App';
import { AuthProvider } from '@/lib/auth';

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <AuthProvider>
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#111827',
            border: '1px solid #1E293B',
            color: '#F1F5F9',
          },
        }}
      />
    </AuthProvider>
  </HashRouter>
);
