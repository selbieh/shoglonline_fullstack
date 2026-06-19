import Avatar from "@/components/Avatar";
import StarRating from "@/components/StarRating";
import { BadgeCheckIcon, EnvelopeIcon, MapPinIcon } from "@/components/icons";

/* Owner / freelancer identity card with rating + CTAs (ppt slides 20/21/22 «صاحب العمل / المستقل»).
   Centered avatar, verified badge, location, star rating, and two actions (view profile + contact). */

export default function OwnerCard({
  title,
  name,
  avatarUrl,
  verified = false,
  location,
  rating,
  ratingCount,
  profileHref,
  profileLabel,
  contactHref = "/messages",
  contactLabel = "تواصل مع صاحب العمل",
}: {
  title: string;
  name: string;
  avatarUrl?: string | null;
  verified?: boolean;
  location?: string;
  rating?: number | null;
  ratingCount?: number;
  profileHref: string;
  profileLabel: string;
  contactHref?: string;
  contactLabel?: string;
}) {
  return (
    <div className="card">
      <h2 className="mb-4 border-b border-line pb-3 text-sm font-bold text-ink">{title}</h2>
      <div className="text-center">
        <Avatar name={name} src={avatarUrl} className="mx-auto h-16 w-16" textClassName="text-xl" />
        <p className="mt-3 flex items-center justify-center gap-1.5 font-bold text-ink">
          {name}
          {verified && <BadgeCheckIcon className="text-[16px] text-primary" />}
        </p>
        {location && (
          <p className="mt-1 flex items-center justify-center gap-1 text-xs text-sub">
            <MapPinIcon className="text-[13px]" /> {location}
          </p>
        )}
        {rating != null && rating > 0 && (
          <div className="mt-2 flex justify-center">
            <StarRating value={rating} count={ratingCount} />
          </div>
        )}
      </div>
      <div className="mt-4 space-y-2">
        <a href={profileHref} className="btn-primary w-full">{profileLabel}</a>
        <a href={contactHref} className="btn-secondary inline-flex w-full items-center justify-center gap-1.5">
          <EnvelopeIcon className="text-[15px]" /> {contactLabel}
        </a>
      </div>
    </div>
  );
}
