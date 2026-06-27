import Link from "next/link";

/**
 * Root not-found boundary. Two jobs:
 *  1) UX — a branded Arabic/RTL 404 instead of Next's default English screen.
 *  2) SEO — gives `notFound()` (job/service/freelancer detail pages) a real boundary so the
 *     response carries a 404 status instead of a soft-404 (HTTP 200), which Google would
 *     otherwise index as a live page and waste crawl budget on.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-[60vh] place-content-center px-6 text-center">
      <p className="text-6xl font-extrabold text-primary">404</p>
      <h1 className="mt-4 text-2xl font-extrabold text-ink">الصفحة غير موجودة</h1>
      <p className="mt-2 max-w-md text-sub">
        عذرًا، تعذّر العثور على ما تبحث عنه. ربما حُذف المحتوى أو تغيّر رابطه.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/" className="btn-primary">العودة للرئيسية</Link>
        <Link href="/jobs" className="btn-secondary">تصفّح الوظائف</Link>
      </div>
    </main>
  );
}
