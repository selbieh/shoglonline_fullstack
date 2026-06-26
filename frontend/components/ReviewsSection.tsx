"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useFieldErrors } from "@/lib/useFieldErrors";
import Field from "@/components/Field";
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
  const [okMsg, setOkMsg] = useState("");
  const { errors, clearFields, formError, setFormError, applyApiError } = useFieldErrors();
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
    setOkMsg("");
    setFormError("");
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
      setOkMsg("✅ شكرًا لتقييمك");
      await load();
    } catch (e) {
      // rating/comment land on their inputs; gating errors (not-completed, locked…) show as a banner.
      applyApiError(e);
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
            <Stars value={rating} onPick={(n) => { setRating(n); clearFields("rating"); }} />
          </div>
          {errors.rating && <p role="alert" className="mt-1 text-xs font-medium text-danger">{errors.rating}</p>}
          <div className="mt-2">
            <Field label="تعليق (اختياري)" error={errors.comment}
              hint={`${comment.length.toLocaleString("en-US")}/1000`}>
              <textarea
                className="w-full field"
                rows={2}
                maxLength={1000}
                placeholder="شارك تجربتك مع الطرف الآخر…"
                value={comment}
                onChange={(e) => { setComment(e.target.value); clearFields("comment"); }}
              />
            </Field>
          </div>
          <button className="btn-primary mt-2" disabled={busy} onClick={submit}>
            {mine ? "تحديث التقييم" : "إرسال التقييم"}
          </button>
        </div>
      )}
      {mine?.is_locked && <p className="mt-2 inline-flex items-center gap-1 text-xs text-sub"><LockIcon className="text-[12px]" /> انتهت فترة الضمان — التقييم مقفل</p>}
      {formError && <p className="mt-2 rounded-m bg-danger-t p-2 text-sm text-danger">⚠️ {formError}</p>}
      {okMsg && <p className="mt-2 text-sm text-success">{okMsg}</p>}
    </section>
  );
}
