import type { FC } from 'react';
import { motion } from 'framer-motion';

const Footer: FC = () => {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.2 }}
      className="mt-10 border-t border-[#1E293B] py-6"
    >
      <div className="mx-auto flex max-w-container items-center justify-between px-4 sm:px-6 lg:px-8">
        <span className="text-xs text-[#64748B]">
          No-Backdoor System Architecture
        </span>
        <span className="font-mono text-xs text-[#64748B]">v2.4.0</span>
      </div>
    </motion.footer>
  );
};

export default Footer;
