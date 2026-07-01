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
  expected_days?: number | null;
  location_type: "remote" | "onsite" | "hybrid";
  country: string;
  city: string;
  status: string;
  published_at: string | null;
  expires_at: string | null;
  created_at?: string;
  proposals_count: number;
  is_locked?: boolean;
  /** Employer (job owner) user id — used client-side to stop an owner bidding on their own job. */
  employer?: number;
  employer_name?: string;
  screening_questions?: ScreeningQuestion[];
  meta_title?: string;
  meta_description?: string;
  /** Invite-only job (FR-JOB-12) — hidden from public search; only invited workers may apply. */
  is_private?: boolean;
  /** True when the signed-in worker was invited to this private job → their proposal is free (BR-7). */
  viewer_invited?: boolean;
};

export type ScreeningQuestion = {
  id: number;
  question: string;
  is_required: boolean;
};

export type PortfolioMediaType = "image" | "video" | "link";

export type PortfolioPreview = { media_type: PortfolioMediaType; thumb: string; title: string };

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
  portfolio_preview?: PortfolioPreview[];
  portfolio_count?: number;
  /** Count of the worker's published services (directory card «الخدمات» stat). */
  services_count?: number;
  /** Years of experience (directory card «سنوات الخبرة» stat). */
  years_experience?: number | null;
  /** Short bio for the directory card description (added to the public list serializer). */
  overview?: string;
  /** Location line for the card meta row, e.g. "القاهرة - مصر" (optional). */
  city?: string;
  country?: string;
  /** ppt slide-07 availability state (for a "متاح للعمل" pill). */
  availability?: "available_now" | "available_soon" | "unavailable";
};

export type PortfolioItem = {
  id: number;
  title: string;
  description: string;
  media_type: PortfolioMediaType;
  url: string;
  cover_url: string;
  image_url: string; // resolved public URL for an uploaded image ("" if none)
  order?: number;
  created_at?: string;
  // ppt slides 05/23 project fields (optional until the add-portfolio UI lands).
  project_type?: string;
  project_link?: string;
  duration_value?: number | null;
  duration_unit?: "day" | "month" | "";
  skills?: string[];
  completed_at?: string | null;
  ownership_confirmed?: boolean;
};

/** The owning freelancer's discipline, attached to each gallery tile (drives the category facet/badge). */
export type GalleryCategory = { id: number; name: string; slug: string };

/** A single tile in the global works gallery (معرض الأعمال) — `/freelancers/portfolio`. Carries
    just enough of the owning freelancer to render identity + link to the slide-22 showcase. */
export type GalleryItem = {
  id: number;
  title: string;
  media_type: PortfolioMediaType;
  thumb: string;
  project_type?: string;
  skills?: string[];
  category?: GalleryCategory | null;
  views_count?: number;
  completed_at?: string | null;
  created_at?: string;
  worker_id: number;
  worker_name: string;
  worker_avatar?: string;
  worker_rating?: string;
  worker_rating_count?: number;
  worker_verified?: boolean;
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

export type WorkerCertificate = {
  id: number;
  name: string;
  issuer: string;
  cert_type: string;
  issued_year: number | null;
  expiry_year: number | null;
  no_expiry: boolean;
  verification_link: string;
  skills: string[];
};
export type ProfileReview = {
  id: number;
  rating: number;
  comment: string;
  author_name: string;
  created_at: string;
};

export type FreelancerDetail = Omit<Freelancer, "skills"> & {
  overview: string;
  cover_image?: string;
  city?: string;
  total_earned?: string;
  intro_video?: string;
  years_experience?: number | null;
  skills: WorkerSkillDetail[];
  languages: WorkerLanguage[];
  educations: WorkerEducation[];
  employments: WorkerEmployment[];
  portfolio: PortfolioItem[];
  certificates?: WorkerCertificate[];
  reviews?: ProfileReview[];
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

export type Skill = {
  id: number;
  name_ar: string;
  slug: string;
  subcategory_id: number;
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
  // Set on a worker's open proposals when their account is frozen (BR-23). Without this the raw
  // English token "suspended" leaked into the Arabic UI via the `?? p.status` fallback.
  suspended: "موقوف",
};
