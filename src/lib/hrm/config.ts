export const HRM_CONFIG = {
  DIRECTOR_APPROVAL_HEADCOUNT_THRESHOLD: 3,
  DIRECTOR_APPROVAL_SALARY_THRESHOLD_VND: 50_000_000,
  OFFER_EXPIRY_DAYS: 7,
  MAX_UPLOAD_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
  ALLOWED_CV_MIMES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  ALLOWED_CV_EXTENSIONS: ['.pdf', '.doc', '.docx'],
  AUTO_ARCHIVE_HIRED_DAYS: 3,
  DEFAULT_TIMEZONE: 'Asia/Ho_Chi_Minh',
} as const;
