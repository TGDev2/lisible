import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDiagnosticRateLimit } from "@/lib/rate-limit";

vi.mock("@/lib/redis", () => ({
  setDiagnosticResult: vi.fn().mockResolvedValue(true),
  getDiagnosticResult: vi.fn().mockResolvedValue(null),
}));

const VALID_SRT_CONTENT = `1
00:00:01,000 --> 00:00:04,000
Bonjour, bienvenue dans cette formation.

2
00:00:05,000 --> 00:00:08,000
Nous allons voir les bases du sous-titrage.
`;

function makeFormData(fileName: string, content: string): FormData {
  const file = new File([content], fileName, { type: "text/plain" });
  const formData = new FormData();
  formData.append("file", file);
  return formData;
}

describe("Integration | POST /api/diagnostic/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDiagnosticRateLimit();
  });

  it("runs complete upload flow and returns score + temporary token", async () => {
    const { POST } = await import("@/app/api/diagnostic/upload/route");
    const formData = makeFormData("integration.srt", VALID_SRT_CONTENT);
    const request = new Request("http://localhost/api/diagnostic/upload", {
      method: "POST",
      body: formData,
      headers: {
        "x-forwarded-for": "172.16.0.10",
      },
    });

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fileId).toBeDefined();
    expect(body.temporaryToken).toMatch(
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
    );
    expect(body.score).toBeGreaterThanOrEqual(0);
    expect(body.score).toBeLessThanOrEqual(100);
    expect(body.breakdown).toBeDefined();
    expect(body.fileName).toBe("integration.srt");
  });
});
