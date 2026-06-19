import { ChatIcon } from "@/components/icons";

/**
 * Desktop: the placeholder shown in the thread pane when no conversation is open (the list lives in
 * the layout). Mobile: this route shows only the list (this pane is hidden by the layout).
 */
export default function MessagesIndex() {
  return (
    <div className="grid h-full w-full place-content-center rounded-l border border-line bg-white">
      <div className="flex flex-col items-center gap-3 px-6 text-center text-sub">
        <ChatIcon className="text-5xl text-primary/40" />
        <p className="text-sm">اختر محادثة لعرضها</p>
      </div>
    </div>
  );
}
