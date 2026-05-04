import type { FC, ReactNode } from 'react';
import { motion } from 'framer-motion';
import Navbar from './Navbar';
import Footer from './Footer';

interface LayoutProps {
  children: ReactNode;
}

const pageTransition = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2, ease: 'easeInOut' as const },
};

const Layout: FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-[100dvh] bg-[#0B0F19]">
      <Navbar />
      <main className="pt-[60px]">
        <motion.div
          key={window.location.pathname}
          initial={pageTransition.initial}
          animate={pageTransition.animate}
          exit={pageTransition.exit}
          transition={pageTransition.transition}
        >
          {children}
        </motion.div>
      </main>
      <Footer />
    </div>
  );
};

export default Layout;
