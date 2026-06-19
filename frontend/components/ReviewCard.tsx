import Avatar from "@/components/Avatar";
import StarRating from "@/components/StarRating";

/* Buyer/client review card (ppt slides 12/18/21 «آراء العملاء / المشترين»): avatar + author +
   star rating + comment. Server-renderable. */

export type ReviewData = {
  id: number;
  author_name: string;
  rating: number;
  comment?: string;
  created_at?: string;
};

export default function ReviewCard({ review }: { review: ReviewData }) {
  return (
    <div className="rounded-l border border-line bg-bg p-4">
      <div className="flex items-center gap-2.5">
        <Avatar name={review.author_name} className="h-9 w-9" textClassName="text-xs" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{review.author_name}</p>
          <StarRating value={review.rating} size="text-[13px]" className="mt-0.5" />
        </div>
      </div>
      {review.comment && <p className="mt-2.5 line-clamp-3 text-sm leading-6 text-sub">{review.comment}</p>}
    </div>
  );
}
