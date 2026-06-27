import { describe, expect, it, vi } from "vitest";

import { fireEvent } from "@testing-library/react";
import { render, screen, waitFor } from "@/test/utils/render";

import MessageComposer from "@/components/chat/MessageComposer";

function makeFile(name: string, bytes: number, type: string) {
  return new File([new Uint8Array(bytes)], name, { type });
}

function fileInputs(container: HTMLElement) {
  return Array.from(container.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
}

describe("<MessageComposer>", () => {
  it("does not send on the Enter that confirms an IME composition (P2-22)", async () => {
    const onSendText = vi.fn().mockResolvedValue(undefined);
    render(<MessageComposer onSendText={onSendText} onSendFile={vi.fn()} />);
    const field = screen.getByPlaceholderText("اكتب رسالتك..");
    fireEvent.change(field, { target: { value: "مرحبا" } });

    // Enter mid-composition (isComposing) must NOT send…
    fireEvent.keyDown(field, { key: "Enter", isComposing: true });
    expect(onSendText).not.toHaveBeenCalled();

    // …but a plain Enter does.
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(onSendText).toHaveBeenCalledWith("مرحبا"));
  });

  it("disables the attachment + mic buttons during an in-flight file upload (P2-19)", async () => {
    // Hold the upload open so busy stays true while we assert.
    let release!: () => void;
    const onSendFile = vi.fn(() => new Promise<void>((r) => (release = r)));
    const { container } = render(<MessageComposer onSendText={vi.fn()} onSendFile={onSendFile} />);

    const imgInput = fileInputs(container)[0];
    fireEvent.change(imgInput, { target: { files: [makeFile("pic.png", 10, "image/png")] } });

    const attachBtn = screen.getByLabelText("إرفاق") as HTMLButtonElement;
    const micBtn = screen.getByLabelText("تسجيل صوتي") as HTMLButtonElement;
    await waitFor(() => expect(attachBtn).toBeDisabled());
    expect(micBtn).toBeDisabled();

    release();
    await waitFor(() => expect(attachBtn).not.toBeDisabled());
  });

  it("blocks a disallowed MIME type client-side without uploading (P2-25)", () => {
    const onSendFile = vi.fn();
    const { container } = render(<MessageComposer onSendText={vi.fn()} onSendFile={onSendFile} />);
    const fileInput = fileInputs(container)[2]; // the generic «ملف» input
    fireEvent.change(fileInput, { target: { files: [makeFile("virus.exe", 10, "application/x-msdownload")] } });
    expect(screen.getByText(/غير مسموح/)).toBeInTheDocument();
    expect(onSendFile).not.toHaveBeenCalled();
  });

  it("blocks an over-size file client-side without uploading (P2-25)", () => {
    const onSendFile = vi.fn();
    const { container } = render(<MessageComposer onSendText={vi.fn()} onSendFile={onSendFile} />);
    const fileInput = fileInputs(container)[2];
    fireEvent.change(fileInput, { target: { files: [makeFile("big.png", 26 * 1024 * 1024, "image/png")] } });
    expect(screen.getByText(/يتجاوز 25MB/)).toBeInTheDocument();
    expect(onSendFile).not.toHaveBeenCalled();
  });

  it("gives the generic file input a MIME allowlist accept (P2-25)", () => {
    const { container } = render(<MessageComposer onSendText={vi.fn()} onSendFile={vi.fn()} />);
    const fileInput = fileInputs(container)[2];
    expect(fileInput.getAttribute("accept")).toContain("application/pdf");
    expect(fileInput.getAttribute("accept")).not.toBe("");
  });
});
