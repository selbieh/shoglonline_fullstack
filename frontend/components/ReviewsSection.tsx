"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LockIcon } from "@/components/icons";

type Review = {
  id: number;
  rating: number;
  comment: string;
  author_name: string;
  mine: boolean;
  is_locked: boolean;
  created_at: string;
};

function Stars({ value, onPick }: { value: number; onPick?: (n: number) => void }) {
  return (
    <span className="text-lg">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onPick}
          onClick={() => onPick?.(n)}
          className={n <= value ? "text-warn" : "text-line-strong"}
          aria-label={`${n} نجوم`}
        >
          ★
        </button>
      ))}
    </span>
  );
}

export default function ReviewsSection({ contractId }: { contractId: string | number }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setReviews(await api<Review[]>(`/contracts/${contractId}/reviews`));
    } catch {
      /* ignore */
    }
  }, [contractId]);

  useEffect(() => {
    load();
  }, [load]);

  const mine = reviews.find((r) => r.mine);

  async function submit() {
    setBusy(true);
    setMsg("");
    try {
      if (mine) {
        await api(`/reviews/${mine.id}`, { method: "PATCH", body: JSON.stringify({ rating, comment }) });
      } else {
        await api(`/contracts/${contractId}/reviews`, {
          method: "POST",
          body: JSON.stringify({ rating, comment }),
        });
      }
      setComment("");
      setMsg("✅ شكرًا لتقييمك");
      await load();
    } catch (e) {
      const raw = JSON.stringify((e as { body?: unknown }).body ?? {});
      const m = raw.match(/"message_ar":"([^"]+)"/);
      setMsg(`⚠️ ${m ? m[1] : "تعذّر حفظ التقييم"}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (mine) {
      setRating(mine.rating);
      setComment(mine.comment);
    }
  }, [mine]);

  return (
    <section className="card mt-4">
      <h2 className="font-bold">التقييمات</h2>

      {reviews.length > 0 && (
        <ul className="mt-3 space-y-2">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-m bg-bg p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{r.author_name}</span>
                <Stars value={r.rating} />
              </div>
              {r.comment && <p className="mt-1 text-primary-deep">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}

      {(!mine || !mine.is_locked) && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-sm text-sub">{mine ? "عدّل تقييمك (متاح حتى نهاية الضمان)" : "أضف تقييمك"}</p>
          <div className="mt-2 flex items-center gap-3">
            <Stars value={rating} onPick={setRating} />
          </div>
          <textarea
            className="mt-2 w-full rounded-m border border-line-strong px-3 py-2 text-sm"
            rows={2}
            placeholder="تعليق (اختياري)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button className="btn-primary mt-2" disabled={busy} onClick={submit}>
            {mine ? "تحديث التقييم" : "إرسال التقييم"}
          </button>
        </div>
      )}
      {mine?.is_locked && <p className="mt-2 inline-flex items-center gap-1 text-xs text-sub"><LockIcon className="text-[12px]" /> انتهت فترة الضمان — التقييم مقفل</p>}
      {msg && <p className="mt-2 text-sm text-sub">{msg}</p>}
    </section>
  );
}
