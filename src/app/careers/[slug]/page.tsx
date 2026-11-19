import React from 'react';
import { MOCK_JOB_POSTINGS } from '@/mock/ats';
import JobDetailClient from './job-detail-client';

export function generateStaticParams() {
  const slugs = new Set<string>();

  for (const job of MOCK_JOB_POSTINGS) {
    if (job.id) slugs.add(job.id.toLowerCase());
    if (job.job_code) {
      slugs.add(job.job_code.toLowerCase());
      slugs.add(job.job_code.toLowerCase().replace(/[^a-z0-9]/g, '-'));
    }
  }

  // Common descriptive fallback slugs
  slugs.add('frontend-engineer');
  slugs.add('backend-engineer');
  slugs.add('product-designer');
  slugs.add('hr-specialist');
  slugs.add('recruitment-lead');

  return Array.from(slugs).map((slug) => ({ slug }));
}

interface PageProps {
  params: {
    slug: string;
  };
}

export default function JobDetailPage({ params }: PageProps) {
  return <JobDetailClient slug={params.slug} />;
}
