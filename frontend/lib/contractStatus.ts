// Shared contract-status labels/chips (Arabic, RTL) — used by the contracts pages.

export const STATUS_LABEL: Record<string, string> = {
  pending_funding: "بانتظار التمويل",
  active: "نشط",
  delivered: "تم التسليم — بانتظار القبول",
  completed: "مكتمل",
  disputed: "متنازع عليه",
  cancelled: "ملغى",
};

export const STATUS_CHIP: Record<string, string> = {
  pending_funding: "bg-warn-t text-warn",
  active: "bg-tint text-primary-dark",
  delivered: "bg-warn-t text-warn",
  completed: "bg-success-t text-success",
  disputed: "bg-danger-t text-danger",
  cancelled: "bg-bg text-sub",
};
