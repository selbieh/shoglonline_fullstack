import { CheckIcon } from "@/components/icons";

/** ✓ sent / ✓✓ read — the double tick overlaps slightly, like familiar chat apps. */
export default function ReadReceipt({ read }: { read: boolean }) {
  return (
    <span className="inline-flex items-center" aria-label={read ? "تمت القراءة" : "تم الإرسال"}>
      <CheckIcon className="text-[12px]" />
      {read && <CheckIcon className="-ms-[7px] text-[12px]" />}
    </span>
  );
}
