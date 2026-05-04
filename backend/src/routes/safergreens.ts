/**
 * Safer Greens — Public marketing routes
 *
 * GET  /api/safergreens/info  → Returns company info (courses, contact, values)
 * POST /api/safergreens/enquiry → Submit a contact/enrolment enquiry
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

// ── Company Info ──────────────────────────────────────────────────

const companyInfo = {
  name: 'Safer Greens Limited',
  tagline: 'Security | Training',
  hero: {
    headline: 'Build Your Future in Safety & Security',
    subheadline: 'We pride ourselves on providing the most up-to-date courses to help you succeed in your fields.',
    stats: [
      { number: '500+', label: 'Students Trained' },
      { number: '30+', label: 'Courses Offered' },
      { number: '100%', label: 'Commitment to Quality' },
    ],
  },
  values: [
    { title: 'Tailored Fit Courses', description: 'Designed for all students, equipping them with relevant new skills for their career path.' },
    { title: 'Dedicated Training Team', description: 'Passionate instructors delivering a positive learning experience with enthusiasm.' },
    { title: 'Identify & Adapt', description: 'Our trainers identify audience needs and adapt methods for maximum impact.' },
  ],
  courses: [
    { category: 'CITB', items: ['SMSTS', 'SMSTS – Refresher', 'SSSTS', 'SSSTS – Refresher'] },
    { category: 'CSCS Cards', items: ['Principles of COSHH (RQF)', 'Risk Assessment (RQF)', 'Assessing Vocational Achievement (RQF)', 'CSCS Card + Touch Screen Tests'] },
    { category: 'First Aid', items: ['Safe Moving & Handling (RQF)', 'First Aid at Work Refresher (RQF)', 'Health & Safety in Workplace (RQF)', 'Emergency First Aid at Work (RQF)'] },
    { category: 'Information Technology', items: ['Microsoft Azure AI (AI-900)', 'Introduction to SQL', 'Intermediate SQL', 'Advanced SQL'] },
    { category: 'NVQ', items: ['Installation and Commissioning'] },
    { category: 'Other Qualifications', items: ['Education and Training (RQF)'] },
  ],
  contact: {
    address: 'Unit D, Chadwell Heath Industrial Park, Kemp Road, Dagenham, RM8 1SL',
    landline: '02085974335',
    mobile: '07557445389',
    email: 'enquiries@safergreens.co.uk',
  },
};

router.get('/info', (_req: Request, res: Response) => {
  res.json({ success: true, data: companyInfo });
});

// ── Enquiry Form ──────────────────────────────────────────────────

router.post('/enquiry', (req: Request, res: Response) => {
  const { name, email, phone, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Name, email, and message are required.' },
    });
  }

  // In production, this would send an email, create a CRM lead, or store in DB
  console.log('[Safer Greens] New enquiry:', { name, email, phone, message });

  return res.json({
    success: true,
    data: { received: true, message: 'Thank you! We will get back to you shortly.' },
  });
});

export default router;
