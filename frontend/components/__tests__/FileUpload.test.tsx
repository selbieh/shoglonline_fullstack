import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import FileUpload from "@/components/FileUpload";

function fileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

function makeFile(name: string, bytes: number, type: string) {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("<FileUpload>", () => {
  it("renders RTL drop-zone copy", () => {
    const { container } = render(<FileUpload onUploaded={() => {}} />);
    expect(screen.getByRole("button")).toHaveTextContent("اسحب وأفلت");
    expect(container.querySelector('[dir="rtl"]')).toBeInTheDocument();
  });

  it("blocks an over-size file client-side without uploading", async () => {
    const onUploaded = vi.fn();
    const { container, user } = render(<FileUpload onUploaded={onUploaded} maxMb={1} />);
    await user.upload(fileInput(container), makeFile("big.png", 2 * 1024 * 1024, "image/png"));
    expect(await screen.findByText(/يتجاوز 1MB/)).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("uploads a valid file and reports the attachment", async () => {
    server.use(
      http.post(`${API_URL}/uploads`, () =>
        HttpResponse.json(
          { id: 7, original_name: "doc.pdf", content_type: "application/pdf", size: 10, kind: "document", url: `${API_URL}/uploads/7`, created_at: "x" },
          { status: 201 },
        ),
      ),
    );
    const onUploaded = vi.fn();
    const { container, user } = render(<FileUpload onUploaded={onUploaded} />);
    await user.upload(fileInput(container), makeFile("doc.pdf", 10, "application/pdf"));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(expect.objectContaining({ id: 7, kind: "document" })));
  });

  it("shows the Arabic error envelope when the server rejects the file", async () => {
    server.use(
      http.post(`${API_URL}/uploads`, () =>
        HttpResponse.json({ code: "file_type_blocked", message_ar: "نوع الملف غير مسموح" }, { status: 400 }),
      ),
    );
    const { container, user } = render(<FileUpload onUploaded={() => {}} />);
    await user.upload(fileInput(container), makeFile("x.bin", 10, "application/octet-stream"));
    expect(await screen.findByText("نوع الملف غير مسموح")).toBeInTheDocument();
  });
});
