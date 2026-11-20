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

export interface IHrmRepository {
  // Proposals
  getProposals(): Promise<JobProposal[]>;
  getProposalById(id: string): Promise<JobProposal | null>;
  saveProposal(proposal: JobProposal): Promise<JobProposal>;

  // Jobs
  getJobPostings(): Promise<JobPostingEntity[]>;
  getJobPostingById(id: string): Promise<JobPostingEntity | null>;
  saveJobPosting(job: JobPostingEntity): Promise<JobPostingEntity>;

  // Candidates & Applications
  getCandidates(): Promise<CandidateEntity[]>;
  getCandidateById(id: string): Promise<CandidateEntity | null>;
  getCandidateByEmail(email: string): Promise<CandidateEntity | null>;
  saveCandidate(candidate: CandidateEntity): Promise<CandidateEntity>;

  getApplications(): Promise<ApplicationEntity[]>;
  getApplicationById(id: string): Promise<ApplicationEntity | null>;
  getApplicationsByCandidateId(candidateId: string): Promise<ApplicationEntity[]>;
  saveApplication(app: ApplicationEntity): Promise<ApplicationEntity>;

  // Interviews
  getInterviews(): Promise<InterviewEntity[]>;
  getInterviewByApplicationId(appId: string): Promise<InterviewEntity | null>;
  saveInterview(interview: InterviewEntity): Promise<InterviewEntity>;

  // Offers
  getOffers(): Promise<OfferEntity[]>;
  getOfferByApplicationId(appId: string): Promise<OfferEntity | null>;
  saveOffer(offer: OfferEntity): Promise<OfferEntity>;

  // Files
  saveFile(file: UploadedFileEntity): Promise<UploadedFileEntity>;
  getFileById(id: string): Promise<UploadedFileEntity | null>;

  // Notifications
  getNotificationsForUser(userId: string): Promise<NotificationEntity[]>;
  saveNotification(notification: NotificationEntity): Promise<NotificationEntity>;

  // Atomic Transactions
  approveAndCreateJob(
    proposalId: string,
    jobData: Partial<JobPostingEntity>,
    actorId: string,
    actorName: string
  ): Promise<{ proposal: JobProposal; job: JobPostingEntity }>;
}
