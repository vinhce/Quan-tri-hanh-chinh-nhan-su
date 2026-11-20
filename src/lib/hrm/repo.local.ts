import { formatJobCode } from './ids';
import type { IHrmRepository } from './repository';
import type {
  ApplicationEntity,
  CandidateEntity,
  InterviewEntity,
  JobPostingEntity,
  JobProposal,
  NotificationEntity,
  OfferEntity,
  UploadedFileEntity,
} from './types';

// In-memory singletons for server runtime / fallback (persisted on globalThis across Next.js route chunks)
declare global {
  // eslint-disable-next-line no-var
  var _hrmMemoryProposals: Map<string, JobProposal> | undefined;
  // eslint-disable-next-line no-var
  var _hrmMemoryJobs: Map<string, JobPostingEntity> | undefined;
  // eslint-disable-next-line no-var
  var _hrmMemoryCandidates: Map<string, CandidateEntity> | undefined;
  // eslint-disable-next-line no-var
  var _hrmMemoryApplications: Map<string, ApplicationEntity> | undefined;
  // eslint-disable-next-line no-var
  var _hrmMemoryInterviews: Map<string, InterviewEntity> | undefined;
  // eslint-disable-next-line no-var
  var _hrmMemoryOffers: Map<string, OfferEntity> | undefined;
  // eslint-disable-next-line no-var
  var _hrmMemoryFiles: Map<string, UploadedFileEntity> | undefined;
  // eslint-disable-next-line no-var
  var _hrmMemoryNotifications: Map<string, NotificationEntity> | undefined;
}

const memoryProposals = (globalThis._hrmMemoryProposals = globalThis._hrmMemoryProposals || new Map<string, JobProposal>());
const memoryJobs = (globalThis._hrmMemoryJobs = globalThis._hrmMemoryJobs || new Map<string, JobPostingEntity>());
const memoryCandidates = (globalThis._hrmMemoryCandidates = globalThis._hrmMemoryCandidates || new Map<string, CandidateEntity>());
const memoryApplications = (globalThis._hrmMemoryApplications = globalThis._hrmMemoryApplications || new Map<string, ApplicationEntity>());
const memoryInterviews = (globalThis._hrmMemoryInterviews = globalThis._hrmMemoryInterviews || new Map<string, InterviewEntity>());
const memoryOffers = (globalThis._hrmMemoryOffers = globalThis._hrmMemoryOffers || new Map<string, OfferEntity>());
const memoryFiles = (globalThis._hrmMemoryFiles = globalThis._hrmMemoryFiles || new Map<string, UploadedFileEntity>());
const memoryNotifications = (globalThis._hrmMemoryNotifications = globalThis._hrmMemoryNotifications || new Map<string, NotificationEntity>());

export class LocalHrmRepository implements IHrmRepository {
  async getProposals(): Promise<JobProposal[]> {
    return Array.from(memoryProposals.values());
  }

  async getProposalById(id: string): Promise<JobProposal | null> {
    return memoryProposals.get(id) || null;
  }

  async saveProposal(proposal: JobProposal): Promise<JobProposal> {
    memoryProposals.set(proposal.id, proposal);
    return proposal;
  }

  async getJobPostings(): Promise<JobPostingEntity[]> {
    return Array.from(memoryJobs.values());
  }

  async getJobPostingById(id: string): Promise<JobPostingEntity | null> {
    return memoryJobs.get(id) || null;
  }

  async saveJobPosting(job: JobPostingEntity): Promise<JobPostingEntity> {
    memoryJobs.set(job.id, job);
    return job;
  }

  async getCandidates(): Promise<CandidateEntity[]> {
    return Array.from(memoryCandidates.values());
  }

  async getCandidateById(id: string): Promise<CandidateEntity | null> {
    return memoryCandidates.get(id) || null;
  }

  async getCandidateByEmail(email: string): Promise<CandidateEntity | null> {
    const list = Array.from(memoryCandidates.values());
    return list.find((c) => c.email.toLowerCase() === email.toLowerCase()) || null;
  }

  async saveCandidate(candidate: CandidateEntity): Promise<CandidateEntity> {
    memoryCandidates.set(candidate.id, candidate);
    return candidate;
  }

  async getApplications(): Promise<ApplicationEntity[]> {
    return Array.from(memoryApplications.values());
  }

  async getApplicationById(id: string): Promise<ApplicationEntity | null> {
    return memoryApplications.get(id) || null;
  }

  async getApplicationsByCandidateId(candidateId: string): Promise<ApplicationEntity[]> {
    const list = Array.from(memoryApplications.values());
    return list.filter((a) => a.candidate_id === candidateId);
  }

  async saveApplication(app: ApplicationEntity): Promise<ApplicationEntity> {
    memoryApplications.set(app.id, app);
    return app;
  }

  async getInterviews(): Promise<InterviewEntity[]> {
    return Array.from(memoryInterviews.values());
  }

  async getInterviewByApplicationId(appId: string): Promise<InterviewEntity | null> {
    const list = Array.from(memoryInterviews.values());
    return list.find((i) => i.application_id === appId) || null;
  }

  async saveInterview(interview: InterviewEntity): Promise<InterviewEntity> {
    memoryInterviews.set(interview.id, interview);
    return interview;
  }

  async getOffers(): Promise<OfferEntity[]> {
    return Array.from(memoryOffers.values());
  }

  async getOfferByApplicationId(appId: string): Promise<OfferEntity | null> {
    const list = Array.from(memoryOffers.values());
    return list.find((o) => o.application_id === appId) || null;
  }

  async saveOffer(offer: OfferEntity): Promise<OfferEntity> {
    memoryOffers.set(offer.id, offer);
    return offer;
  }

  async saveFile(file: UploadedFileEntity): Promise<UploadedFileEntity> {
    memoryFiles.set(file.id, file);
    return file;
  }

  async getFileById(id: string): Promise<UploadedFileEntity | null> {
    return memoryFiles.get(id) || null;
  }

  async getNotificationsForUser(userId: string): Promise<NotificationEntity[]> {
    const list = Array.from(memoryNotifications.values());
    return list.filter((n) => n.to_user_id === userId);
  }

  async saveNotification(notification: NotificationEntity): Promise<NotificationEntity> {
    memoryNotifications.set(notification.id, notification);
    return notification;
  }

  async approveAndCreateJob(
    proposalId: string,
    jobData: Partial<JobPostingEntity>,
    actorId: string,
    actorName: string
  ): Promise<{ proposal: JobProposal; job: JobPostingEntity }> {
    const proposal = await this.getProposalById(proposalId);
    if (!proposal) {
      throw new Error(`Không tìm thấy đề xuất với id: ${proposalId}`);
    }
    if (proposal.status === 'posted') {
      throw new Error('Đề xuất này đã được tạo tin tuyển dụng.');
    }

    const now = new Date().toISOString();
    const currentYear = new Date().getFullYear();
    const deptPrefix = proposal.department_name.includes('Phần mềm')
      ? 'SWE'
      : proposal.department_name.includes('Dữ liệu')
      ? 'AI'
      : proposal.department_name.includes('Kinh doanh')
      ? 'BIZ'
      : 'HR';

    const jobId = `job-${Date.now()}`;
    const jobCode = formatJobCode(currentYear, deptPrefix, Math.floor(Math.random() * 90) + 10);

    const newJob: JobPostingEntity = {
      id: jobId,
      code: jobCode,
      proposal_id: proposal.id,
      title: proposal.title,
      department_id: proposal.department_id,
      department_name: proposal.department_name,
      level: proposal.level,
      headcount_target: proposal.headcount,
      hired_count: 0,
      open_slots: proposal.headcount,
      salary_min: proposal.salary_min,
      salary_max: proposal.salary_max,
      status: 'open',
      hiring_manager_name: proposal.requested_by_name,
      published_date: now.split('T')[0],
      deadline: proposal.deadline,
      location: jobData.location || 'Hà Nội (Trụ sở chính) / Hybrid',
      work_mode: jobData.work_mode || 'Hybrid',
      employment_type: jobData.employment_type || 'Toàn thời gian',
      overview: jobData.overview || proposal.reason,
      responsibilities: jobData.responsibilities || [],
      requirements: jobData.requirements || [],
      benefits: jobData.benefits || [],
      version: 1,
      created_at: now,
      updated_at: now,
    };

    const updatedProposal: JobProposal = {
      ...proposal,
      status: 'posted',
      job_id: jobId,
      approved_by_id: actorId,
      approved_by_name: actorName,
      approved_at: now,
      version: proposal.version + 1,
      updated_at: now,
    };

    await this.saveJobPosting(newJob);
    await this.saveProposal(updatedProposal);

    return { proposal: updatedProposal, job: newJob };
  }
}

export const localRepo = new LocalHrmRepository();
