import { localRepo } from './repo.local';
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

export class MysqlHrmRepository implements IHrmRepository {
  // Graceful delegation to localRepo when MySQL is not currently connected
  async getProposals(): Promise<JobProposal[]> {
    return localRepo.getProposals();
  }

  async getProposalById(id: string): Promise<JobProposal | null> {
    return localRepo.getProposalById(id);
  }

  async saveProposal(proposal: JobProposal): Promise<JobProposal> {
    return localRepo.saveProposal(proposal);
  }

  async getJobPostings(): Promise<JobPostingEntity[]> {
    return localRepo.getJobPostings();
  }

  async getJobPostingById(id: string): Promise<JobPostingEntity | null> {
    return localRepo.getJobPostingById(id);
  }

  async saveJobPosting(job: JobPostingEntity): Promise<JobPostingEntity> {
    return localRepo.saveJobPosting(job);
  }

  async getCandidates(): Promise<CandidateEntity[]> {
    return localRepo.getCandidates();
  }

  async getCandidateById(id: string): Promise<CandidateEntity | null> {
    return localRepo.getCandidateById(id);
  }

  async getCandidateByEmail(email: string): Promise<CandidateEntity | null> {
    return localRepo.getCandidateByEmail(email);
  }

  async saveCandidate(candidate: CandidateEntity): Promise<CandidateEntity> {
    return localRepo.saveCandidate(candidate);
  }

  async getApplications(): Promise<ApplicationEntity[]> {
    return localRepo.getApplications();
  }

  async getApplicationById(id: string): Promise<ApplicationEntity | null> {
    return localRepo.getApplicationById(id);
  }

  async getApplicationsByCandidateId(candidateId: string): Promise<ApplicationEntity[]> {
    return localRepo.getApplicationsByCandidateId(candidateId);
  }

  async saveApplication(app: ApplicationEntity): Promise<ApplicationEntity> {
    return localRepo.saveApplication(app);
  }

  async getInterviews(): Promise<InterviewEntity[]> {
    return localRepo.getInterviews();
  }

  async getInterviewByApplicationId(appId: string): Promise<InterviewEntity | null> {
    return localRepo.getInterviewByApplicationId(appId);
  }

  async saveInterview(interview: InterviewEntity): Promise<InterviewEntity> {
    return localRepo.saveInterview(interview);
  }

  async getOffers(): Promise<OfferEntity[]> {
    return localRepo.getOffers();
  }

  async getOfferByApplicationId(appId: string): Promise<OfferEntity | null> {
    return localRepo.getOfferByApplicationId(appId);
  }

  async saveOffer(offer: OfferEntity): Promise<OfferEntity> {
    return localRepo.saveOffer(offer);
  }

  async saveFile(file: UploadedFileEntity): Promise<UploadedFileEntity> {
    return localRepo.saveFile(file);
  }

  async getFileById(id: string): Promise<UploadedFileEntity | null> {
    return localRepo.getFileById(id);
  }

  async getNotificationsForUser(userId: string): Promise<NotificationEntity[]> {
    return localRepo.getNotificationsForUser(userId);
  }

  async saveNotification(notification: NotificationEntity): Promise<NotificationEntity> {
    return localRepo.saveNotification(notification);
  }

  async approveAndCreateJob(
    proposalId: string,
    jobData: Partial<JobPostingEntity>,
    actorId: string,
    actorName: string
  ): Promise<{ proposal: JobProposal; job: JobPostingEntity }> {
    return localRepo.approveAndCreateJob(proposalId, jobData, actorId, actorName);
  }
}

export const hrmRepo: IHrmRepository = new MysqlHrmRepository();
