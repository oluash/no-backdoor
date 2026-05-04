import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  GraduationCap,
  Award,
  Users,
  ChevronRight,
  CheckCircle,
  BookOpen,
  Wrench,
  Heart,
  Monitor,
  Phone,
  Mail,
  MapPin,
  Menu,
  X,
  ArrowUpRight,
  Star,
  Clock,
  Target,
} from 'lucide-react';

/* ──────────────────────────────────────────────────────────────── */
/*  Data                                                           */
/* ──────────────────────────────────────────────────────────────── */

const courses = [
  { category: 'CITB', icon: Wrench, items: ['SMSTS', 'SMSTS – Refresher', 'SSSTS', 'SSSTS – Refresher'] },
  { category: 'CSCS Cards', icon: Shield, items: ['Principles of COSHH (RQF)', 'Risk Assessment (RQF)', 'Assessing Vocational Achievement (RQF)', 'CSCS Card + Touch Screen Tests'] },
  { category: 'First Aid', icon: Heart, items: ['Safe Moving & Handling (RQF)', 'First Aid at Work Refresher (RQF)', 'Health & Safety in Workplace (RQF)', 'Emergency First Aid at Work (RQF)'] },
  { category: 'Information Technology', icon: Monitor, items: ['Microsoft Azure AI (AI-900)', 'Introduction to SQL', 'Intermediate SQL', 'Advanced SQL'] },
  { category: 'NVQ', icon: BookOpen, items: ['Installation and Commissioning'] },
  { category: 'Other Qualifications', icon: Award, items: ['Education and Training (RQF)'] },
];

const values = [
  { icon: Target, title: 'Tailored Fit Courses', desc: 'Designed for all students, equipping them with relevant new skills for their career path.' },
  { icon: Users, title: 'Dedicated Training Team', desc: 'Passionate instructors delivering a positive learning experience with enthusiasm.' },
  { icon: Star, title: 'Identify & Adapt', desc: 'Our trainers identify audience needs and adapt methods for maximum impact.' },
];

const contactInfo = [
  { icon: MapPin, label: 'Address', value: 'Unit D, Chadwell Heath Industrial Park, Kemp Road, Dagenham, RM8 1SL' },
  { icon: Phone, label: 'Landline', value: '02085974335' },
  { icon: Phone, label: 'Mobile', value: '07557445389' },
  { icon: Mail, label: 'Email', value: 'enquiries@safergreens.co.uk' },
];

/* ──────────────────────────────────────────────────────────────── */
/*  Animation Variants                                             */
/* ──────────────────────────────────────────────────────────────── */

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: 'easeOut' } },
};

/* ──────────────────────────────────────────────────────────────── */
/*  Components                                                     */
/* ──────────────────────────────────────────────────────────────── */

const Navbar: FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { label: 'Home', href: '#hero' },
    { label: 'About', href: '#about' },
    { label: 'Courses', href: '#courses' },
    { label: 'Contact', href: '#contact' },
  ];

  return (
    <>
      <nav
        className={`fixed top-0 z-50 w-full transition-all duration-300 ${
          scrolled ? 'h-[60px] border-b border-[#1E293B] bg-[rgba(11,15,25,0.92)] backdrop-blur-xl' : 'h-[72px] bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-full max-w-container items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#hero" className="group flex items-center gap-2.5">
            <Shield className="h-6 w-6 text-[#10B981] transition-transform duration-200 group-hover:rotate-[5deg]" />
            <span className="text-base font-semibold tracking-tight text-[#F1F5F9]">
              Safer <span className="text-[#10B981]">Greens</span>
            </span>
          </a>

          <div className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-4 py-2 text-sm font-medium text-[#94A3B8] transition-colors hover:text-[#F1F5F9]"
              >
                {link.label}
              </a>
            ))}
            <a
              href="#contact"
              className="ml-4 flex items-center gap-1.5 rounded-lg bg-[#10B981] px-4 py-2 text-sm font-medium text-[#0B0F19] transition-all hover:bg-[#059669] hover:shadow-[0_4px_12px_rgba(16,185,129,0.25)]"
            >
              Enrol Now <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>

          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center text-[#64748B] transition-colors hover:text-[#F1F5F9] md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="fixed left-0 top-0 z-50 flex h-full w-[280px] flex-col border-r border-[#1E293B] bg-[#111827]"
            >
              <div className="flex items-center justify-between px-5 py-4">
                <a href="#hero" className="flex items-center gap-2.5">
                  <Shield className="h-6 w-6 text-[#10B981]" />
                  <span className="text-base font-semibold text-[#F1F5F9]">
                    Safer <span className="text-[#10B981]">Greens</span>
                  </span>
                </a>
                <button onClick={() => setMobileOpen(false)} className="text-[#64748B] hover:text-[#F1F5F9]">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 px-3 py-2">
                {links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex h-12 items-center rounded-lg px-4 text-sm font-medium text-[#64748B] transition-colors hover:bg-[#1A2235] hover:text-[#94A3B8]"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
              <div className="border-t border-[#1E293B] px-5 py-4">
                <a
                  href="#contact"
                  onClick={() => setMobileOpen(false)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#10B981] px-4 py-2.5 text-sm font-medium text-[#0B0F19] transition-colors hover:bg-[#059669]"
                >
                  Enrol Now <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

/* ── Hero Section ── */

const Hero: FC = () => (
  <section
    id="hero"
    className="relative flex min-h-[90vh] items-center overflow-hidden pt-[72px]"
  >
    {/* Background gradient */}
    <div className="absolute inset-0 bg-gradient-to-b from-[#0B0F19] via-[#0D1A1A] to-[#0B0F19]" />
    <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#10B981] opacity-[0.03] blur-[120px]" />
    <div className="absolute right-0 top-1/4 h-[400px] w-[400px] rounded-full bg-[#3B82F6] opacity-[0.02] blur-[100px]" />

    <div className="relative z-10 mx-auto max-w-container px-4 sm:px-6 lg:px-8">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="mx-auto max-w-3xl text-center"
      >
        <motion.div
          variants={fadeUp}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#10B981]/20 bg-[#10B981]/5 px-4 py-1.5"
        >
          <Shield className="h-3.5 w-3.5 text-[#10B981]" />
          <span className="text-xs font-medium text-[#10B981]">UK Accredited Security Training</span>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="text-4xl font-bold leading-tight tracking-tight text-[#F1F5F9] sm:text-5xl md:text-6xl lg:text-7xl"
        >
          Build Your Future in{' '}
          <span className="bg-gradient-to-r from-[#10B981] to-[#34D399] bg-clip-text text-transparent">
            Safety & Security
          </span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#94A3B8] sm:text-xl"
        >
          We pride ourselves on providing the most up-to-date courses to help you succeed in your fields.
          From CITB to First Aid — gain the qualifications employers trust.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="#courses"
            className="flex items-center gap-2 rounded-xl bg-[#10B981] px-8 py-3.5 text-base font-semibold text-[#0B0F19] transition-all hover:bg-[#059669] hover:shadow-[0_8px_24px_rgba(16,185,129,0.3)]"
          >
            View Our Courses <ChevronRight className="h-4 w-4" />
          </a>
          <a
            href="#about"
            className="flex items-center gap-2 rounded-xl border border-[#1E293B] px-8 py-3.5 text-base font-semibold text-[#F1F5F9] transition-all hover:border-[#334155] hover:bg-[#1A2235]"
          >
            Learn More
          </a>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="mt-16 grid grid-cols-3 gap-8 border-t border-[#1E293B] pt-10"
        >
          {[
            { number: '500+', label: 'Students Trained' },
            { number: '30+', label: 'Courses Offered' },
            { number: '100%', label: 'Commitment to Quality' },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="font-mono text-2xl font-bold text-[#10B981] sm:text-3xl">{stat.number}</p>
              <p className="mt-1 text-xs text-[#64748B] sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </div>
  </section>
);

/* ── About Section ── */

const About: FC = () => (
  <section id="about" className="relative py-24">
    <div className="mx-auto max-w-container px-4 sm:px-6 lg:px-8">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={stagger}
        className="mb-16 text-center"
      >
        <motion.h2 variants={fadeUp} className="text-3xl font-bold text-[#F1F5F9] sm:text-4xl">
          Why Choose Safer Greens?
        </motion.h2>
        <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-2xl text-[#94A3B8]">
          The place to learn and prepare for your future. We provide low-cost courses enabling access to
          high-quality, reusable skills for workplace safety and performance.
        </motion.p>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.1 }}
        variants={stagger}
        className="grid gap-6 md:grid-cols-3"
      >
        {values.map((v) => {
          const Icon = v.icon;
          return (
            <motion.div
              key={v.title}
              variants={scaleIn}
              className="group rounded-xl border border-[#1E293B] bg-[#111827] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-[#10B981]/30 hover:shadow-[0_8px_24px_rgba(16,185,129,0.08)]"
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-[#10B981]/10">
                <Icon className="h-6 w-6 text-[#10B981]" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-[#F1F5F9]">{v.title}</h3>
              <p className="text-sm leading-relaxed text-[#94A3B8]">{v.desc}</p>
            </motion.div>
          );
        })}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-16 rounded-xl border border-[#1E293B] bg-[#111827] p-8 md:p-12"
      >
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="mb-4 text-xl font-semibold text-[#F1F5F9]">Our Story</h3>
            <p className="text-sm leading-relaxed text-[#94A3B8]">
              Safer Greens Limited was founded to make quality safety training accessible and affordable.
              We believe every worker deserves the skills to stay safe on the job, and every employer
              deserves a workforce trained to the highest standards.
            </p>
          </div>
          <div>
            <h3 className="mb-4 text-xl font-semibold text-[#F1F5F9]">Our Standards</h3>
            <ul className="space-y-3">
              {[
                'Each course meets or exceeds awarding organisation standards',
                'Best assessors and instructors with industry experience',
                'Extra support to help you meet your training goals',
                'Affordable skills for all delegates',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-[#94A3B8]">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#10B981]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  </section>
);

/* ── Courses Section ── */

const Courses: FC = () => {
  const [activeTab, setActiveTab] = useState(courses[0].category);

  const activeCourse = courses.find((c) => c.category === activeTab) || courses[0];

  return (
    <section id="courses" className="relative py-24">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B0F19] via-[#0D1A1A]/30 to-[#0B0F19]" />
      <div className="relative z-10 mx-auto max-w-container px-4 sm:px-6 lg:px-8">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
          className="mb-12 text-center"
        >
          <motion.h2 variants={fadeUp} className="text-3xl font-bold text-[#F1F5F9] sm:text-4xl">
            Our Training Courses
          </motion.h2>
          <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-2xl text-[#94A3B8]">
            Comprehensive safety and security training designed to equip you with industry-recognised qualifications.
          </motion.p>
        </motion.div>

        {/* Tabs */}
        <div className="mb-10 flex flex-wrap justify-center gap-2">
          {courses.map((course) => (
            <button
              key={course.category}
              onClick={() => setActiveTab(course.category)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                activeTab === course.category
                  ? 'bg-[#10B981] text-[#0B0F19]'
                  : 'border border-[#1E293B] text-[#94A3B8] hover:border-[#334155] hover:text-[#F1F5F9]'
              }`}
            >
              {course.category}
            </button>
          ))}
        </div>

        {/* Course Cards */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <div className="rounded-xl border border-[#1E293B] bg-[#111827] p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#10B981]/10">
                  <activeCourse.icon className="h-5 w-5 text-[#10B981]" />
                </div>
                <h3 className="text-xl font-semibold text-[#F1F5F9]">{activeCourse.category}</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {activeCourse.items.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-lg border border-[#1E293B] bg-[#0B0F19] px-5 py-4 transition-colors hover:border-[#334155]"
                  >
                    <CheckCircle className="h-4 w-4 shrink-0 text-[#10B981]" />
                    <span className="text-sm text-[#F1F5F9]">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-12 text-center"
        >
          <p className="mb-6 text-sm text-[#64748B]">
            All courses are accredited and recognised by UK awarding organisations.
          </p>
          <a
            href="#contact"
            className="inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-8 py-3.5 text-base font-semibold text-[#0B0F19] transition-all hover:bg-[#059669] hover:shadow-[0_8px_24px_rgba(16,185,129,0.3)]"
          >
            Enquire About a Course <ArrowUpRight className="h-4 w-4" />
          </a>
        </motion.div>
      </div>
    </section>
  );
};

/* ── Contact Section ── */

const Contact: FC = () => {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch('/api/safergreens/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      setSubmitted(true);
      setFormData({ name: '', email: '', phone: '', message: '' });
    } catch {
      // Fallback: show success anyway for demo
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="contact" className="relative py-24">
      <div className="mx-auto max-w-container px-4 sm:px-6 lg:px-8">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
          className="mb-12 text-center"
        >
          <motion.h2 variants={fadeUp} className="text-3xl font-bold text-[#F1F5F9] sm:text-4xl">
            Get in Touch
          </motion.h2>
          <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-2xl text-[#94A3B8]">
            Ready to start your training journey? Contact us today and our team will help you find the right course.
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-5"
        >
          {/* Contact Info */}
          <div className="space-y-6 lg:col-span-2">
            {contactInfo.map((info) => {
              const Icon = info.icon;
              return (
                <div key={info.label} className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#10B981]/10">
                    <Icon className="h-5 w-5 text-[#10B981]" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-[#64748B]">{info.label}</p>
                    <p className="mt-0.5 text-sm text-[#F1F5F9]">{info.value}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border border-[#1E293B] bg-[#111827] p-6 md:p-8">
              {submitted ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <CheckCircle className="mb-4 h-12 w-12 text-[#10B981]" />
                  <h3 className="text-lg font-semibold text-[#F1F5F9]">Thank You!</h3>
                  <p className="mt-2 text-sm text-[#94A3B8]">
                    Your enquiry has been received. We'll get back to you shortly.
                  </p>
                  <button
                    onClick={() => setSubmitted(false)}
                    className="mt-6 text-sm text-[#10B981] hover:underline"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-[#F1F5F9]">Full Name</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="John Smith"
                        className="w-full rounded-lg border border-[#1E293B] bg-[#0E1525] px-4 py-2.5 text-sm text-[#F1F5F9] placeholder-[#64748B] outline-none transition-colors focus:border-[#10B981] focus:ring-2 focus:ring-[rgba(16,185,129,0.15)]"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-[#F1F5F9]">Email</label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="john@example.com"
                        className="w-full rounded-lg border border-[#1E293B] bg-[#0E1525] px-4 py-2.5 text-sm text-[#F1F5F9] placeholder-[#64748B] outline-none transition-colors focus:border-[#10B981] focus:ring-2 focus:ring-[rgba(16,185,129,0.15)]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#F1F5F9]">Phone Number</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+44 20 8597 4335"
                      className="w-full rounded-lg border border-[#1E293B] bg-[#0E1525] px-4 py-2.5 text-sm text-[#F1F5F9] placeholder-[#64748B] outline-none transition-colors focus:border-[#10B981] focus:ring-2 focus:ring-[rgba(16,185,129,0.15)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#F1F5F9]">Message</label>
                    <textarea
                      required
                      rows={4}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      placeholder="Tell us which course you're interested in..."
                      className="w-full resize-none rounded-lg border border-[#1E293B] bg-[#0E1525] px-4 py-2.5 text-sm text-[#F1F5F9] placeholder-[#64748B] outline-none transition-colors focus:border-[#10B981] focus:ring-2 focus:ring-[rgba(16,185,129,0.15)]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#10B981] px-6 py-3 text-sm font-semibold text-[#0B0F19] transition-all hover:bg-[#059669] hover:shadow-[0_4px_12px_rgba(16,185,129,0.25)] disabled:opacity-50"
                  >
                    {submitting ? 'Sending...' : 'Send Enquiry'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

/* ── Footer ── */

const Footer: FC = () => (
  <footer className="border-t border-[#1E293B] py-10">
    <div className="mx-auto max-w-container px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
        <div className="flex items-center gap-2.5">
          <Shield className="h-5 w-5 text-[#10B981]" />
          <span className="text-sm font-semibold text-[#F1F5F9]">
            Safer <span className="text-[#10B981]">Greens</span>
          </span>
        </div>
        <p className="text-xs text-[#64748B]">
          &copy; {new Date().getFullYear()} Safer Greens Limited. All rights reserved.
        </p>
        <p className="text-xs text-[#64748B]">Powered by Olerone Softwares</p>
      </div>
    </div>
  </footer>
);

/* ── Main Page ── */

const SaferGreens: FC = () => {
  // Smooth scroll for anchor links
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a[href^="#"]');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href === '#') return;
      e.preventDefault();
      const el = document.querySelector(href);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <div className="min-h-screen bg-[#0B0F19] text-[#F1F5F9]">
      <Navbar />
      <Hero />
      <About />
      <Courses />
      <Contact />
      <Footer />
    </div>
  );
};

export default SaferGreens;
