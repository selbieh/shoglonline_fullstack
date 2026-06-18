export type Job = {
  id: number;
  title: string;
  slug: string;
  description?: string;
  category: number;
  category_name: string;
  skill_names?: string[];
  budget_min: string;
  budget_max: string;
  location_type: "remote" | "onsite" | "hybrid";
  country: string;
  city: string;
  status: string;
  published_at: string | null;
  expires_at: string | null;
  created_at?: string;
  proposals_count: number;
  is_locked?: boolean;
  employer_name?: string;
  screening_questions?: ScreeningQuestion[];
};

export type ScreeningQuestion = {
  id: number;
  question: string;
  is_required: boolean;
};

export type Freelancer = {
  id: number;
  name: string;
  avatar_url: string;
  bio_title: string;
  expertise_level: "entry" | "intermediate" | "expert" | "";
  hourly_rate: string | null;
  rating_avg: string;
  rating_count: number;
  is_verified: boolean;
  skills: string[];
};

export type WorkerSkillDetail = { skill_id: number; name: string; efficiency: string };
export type WorkerLanguage = { name: string; proficiency: string };
export type WorkerEducation = {
  school: string;
  area_of_study: string;
  degree: string;
  date_from: string;
  date_to: string;
  description: string;
};
export type WorkerEmployment = {
  company: string;
  job_title: string;
  city: string;
  country: string;
  period_from: string;
  period_to: string;
  description: string;
};

export type FreelancerDetail = Omit<Freelancer, "skills"> & {
  overview: string;
  skills: WorkerSkillDetail[];
  languages: WorkerLanguage[];
  educations: WorkerEducation[];
  employments: WorkerEmployment[];
};

export const EXPERTISE_LABEL: Record<string, string> = {
  entry: "مبتدئ",
  intermediate: "متوسط",
  expert: "خبير",
};

export type Category = {
  id: number;
  name_ar: string;
  slug: string;
  icon: string;
  children: Category[];
};

export type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export const LOCATION_LABEL: Record<string, string> = {
  remote: "عن بُعد",
  onsite: "حضوري",
  hybrid: "هجين",
};

export type Proposal = {
  id: number;
  job: number;
  job_title: string;
  job_slug: string;
  worker_name: string;
  budget: string;
  delivery_days: number;
  description: string;
  status: string;
  reject_reason: string;
  bid_consumed: boolean;
  bid_refunded: boolean;
  created_at: string;
};

/** Statuses a worker may still cancel (mirrors backend cancel_proposal: BR-5). */
export const PROPOSAL_CANCELLABLE = ["submitted", "viewed"];

export const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  pending_approval: "بانتظار موافقة الإدارة",
  submitted: "مُرسل — لم يُشاهد",
  viewed: "مُشاهد",
  accepted: "مقبول 🎉",
  rejected: "مرفوض",
  cancelled: "ملغى",
  withdrawn: "مسحوب — استُرد عرضك",
};
