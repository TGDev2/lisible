// @vitest-environment node
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

3
00:00:09,000 --> 00:00:12,000
Commençons par le premier chapitre.
`;

const VALID_VTT_CONTENT = `WEBVTT

00:00:01.000 --> 00:00:04.000
Bonjour, bienvenue dans cette formation.

00:00:05.000 --> 00:00:08.000
Nous allons voir les bases du sous-titrage.

00:00:09.000 --> 00:00:12.000
Commençons par le premier chapitre.
`;

const MALFORMED_SRT_CONTENT = `This is not a valid subtitle file.
Just some random text.
No timecodes here.
`;

function makeFormData(
  fileName: string,
  content: string,
  mimeType = "text/plain"
): FormData {
  const file = new File([content], fileName, { type: mimeType });
  const formData = new FormData();
  formData.append("file", file);
  return formData;
}

function makeDiagnosticRequest(formData: FormData, ip = "127.0.0.1"): Request {
  return new Request("http://localhost/api/diagnostic/upload", {
    method: "POST",
    body: formData,
    headers: {
      "x-forwarded-for": ip,
    },
  });
}

describe("POST /api/diagnostic/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDiagnosticRateLimit();
  });

  it("returns score for a valid SRT file", async () => {
    const { POST } = await import("@/app/api/diagnostic/upload/route");
    const formData = makeFormData("test.srt", VALID_SRT_CONTENT);
    const request = makeDiagnosticRequest(formData);

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fileId).toBeDefined();
    expect(body.temporaryToken).toMatch(
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
    );
    expect(body.score).toBeGreaterThanOrEqual(0);
    expect(body.score).toBeLessThanOrEqual(100);
    expect(body.breakdown.bySeverity).toHaveProperty("critical");
    expect(body.breakdown.bySeverity).toHaveProperty("warning");
    expect(body.breakdown.bySeverity).toHaveProperty("info");
    expect(Array.isArray(body.topAlerts)).toBe(true);
    expect(body.topAlerts.length).toBeLessThanOrEqual(3);
    expect(body.segmentCount).toBe(3);
    expect(body.format).toBe("srt");
    expect(body.fileName).toBe("test.srt");
  });

  it("orders top alerts by impact, not only by severity", async () => {
    const { POST } = await import("@/app/api/diagnostic/upload/route");

    const highImpactLengthWarnings = "a".repeat(90);
    const speedCriticalText = "abcdefghijklmnopqrstuvwx";

    const weightedSrt = `1
00:00:01,000 --> 00:00:07,000
${highImpactLengthWarnings}

2
00:00:08,000 --> 00:00:14,000
${highImpactLengthWarnings}

3
00:00:15,000 --> 00:00:21,000
${highImpactLengthWarnings}

4
00:00:22,000 --> 00:00:23,100
${speedCriticalText}
`;

    const formData = makeFormData("weighted.srt", weightedSrt);
    const request = makeDiagnosticRequest(formData);

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.topAlerts[0].ruleCode).toBe("length");
    expect(body.topAlerts[1].ruleCode).toBe("speed");
  });

  it("returns score for a valid VTT file", async () => {
    const { POST } = await import("@/app/api/diagnostic/upload/route");
    const formData = makeFormData("test.vtt", VALID_VTT_CONTENT, "text/vtt");
    const request = makeDiagnosticRequest(formData);

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.score).toBeGreaterThanOrEqual(0);
    expect(body.score).toBeLessThanOrEqual(100);
    expect(body.segmentCount).toBe(3);
    expect(body.format).toBe("vtt");
  });

  it("returns 400 for unsupported file format (.txt)", async () => {
    const { POST } = await import("@/app/api/diagnostic/upload/route");
    const formData = makeFormData("readme.txt", "Some text content");
    const request = makeDiagnosticRequest(formData);

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Formats acceptés : SRT, VTT");
  });

  it("returns 400 for video file (.mp4)", async () => {
    const { POST } = await import("@/app/api/diagnostic/upload/route");
    const formData = makeFormData("video.mp4", "fake video data", "video/mp4");
    const request = makeDiagnosticRequest(formData);

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Formats acceptés : SRT, VTT");
  });

  it("returns 400 for empty file", async () => {
    const { POST } = await import("@/app/api/diagnostic/upload/route");
    const formData = makeFormData("empty.srt", "");
    const request = makeDiagnosticRequest(formData);

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Le fichier est vide.");
  });

  it("returns 400 for malformed SRT with no valid segments", async () => {
    const { POST } = await import("@/app/api/diagnostic/upload/route");
    const formData = makeFormData("bad.srt", MALFORMED_SRT_CONTENT);
    const request = makeDiagnosticRequest(formData);

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Aucun segment trouvé");
  });

  it("returns 400 when no file is provided", async () => {
    const { POST } = await import("@/app/api/diagnostic/upload/route");
    const formData = new FormData();
    const request = makeDiagnosticRequest(formData);

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Aucun fichier fourni.");
  });

  it("returns 429 when rate limited on 11th request from same IP", async () => {
    const { POST } = await import("@/app/api/diagnostic/upload/route");
    const ip = "192.168.1.100";

    for (let i = 0; i < 10; i++) {
      const formData = makeFormData("test.srt", VALID_SRT_CONTENT);
      const request = makeDiagnosticRequest(formData, ip);
      const response = await POST(request as never);
      expect(response.status).toBe(200);
    }

    const formData = makeFormData("test.srt", VALID_SRT_CONTENT);
    const request = makeDiagnosticRequest(formData, ip);
    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.error).toContain("Trop de diagnostics");
    expect(body.resetIn).toBeGreaterThan(0);
    expect(response.headers.get("Retry-After")).toBeDefined();
  });

  it("allows requests from different IPs independently", async () => {
    const { POST } = await import("@/app/api/diagnostic/upload/route");

    for (let i = 0; i < 10; i++) {
      const formData = makeFormData("test.srt", VALID_SRT_CONTENT);
      const request = makeDiagnosticRequest(formData, "10.0.0.1");
      await POST(request as never);
    }

    const formData = makeFormData("test.srt", VALID_SRT_CONTENT);
    const request = makeDiagnosticRequest(formData, "10.0.0.2");
    const response = await POST(request as never);

    expect(response.status).toBe(200);
  });

  it("stores result in Redis after successful analysis", async () => {
    const { setDiagnosticResult } = await import("@/lib/redis");
    const { POST } = await import("@/app/api/diagnostic/upload/route");

    const formData = makeFormData("test.srt", VALID_SRT_CONTENT);
    const request = makeDiagnosticRequest(formData);

    const response = await POST(request as never);
    expect(response.status).toBe(200);

    expect(setDiagnosticResult).toHaveBeenCalledTimes(1);
    const [fileId, data] = vi.mocked(setDiagnosticResult).mock.calls[0]!;
    expect(fileId).toBeDefined();
    const parsed = JSON.parse(data);
    expect(parsed.fileId).toBe(fileId);
    expect(parsed.score).toBeDefined();
    expect(parsed.fileName).toBe("test.srt");
  });

  it("returns 503 when Redis storage fails", async () => {
    const { setDiagnosticResult } = await import("@/lib/redis");
    vi.mocked(setDiagnosticResult).mockResolvedValueOnce(false);
    const { POST } = await import("@/app/api/diagnostic/upload/route");

    const formData = makeFormData("test.srt", VALID_SRT_CONTENT);
    const request = makeDiagnosticRequest(formData);
    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain("Service temporairement indisponible");
  });

  it("calculates a high score for a clean file", async () => {
    const { POST } = await import("@/app/api/diagnostic/upload/route");

    const cleanSrt = `1
00:00:01,000 --> 00:00:05,000
Bonjour.

2
00:00:06,000 --> 00:00:10,000
Au revoir.

3
00:00:11,000 --> 00:00:15,000
Merci.
`;

    const formData = makeFormData("clean.srt", cleanSrt);
    const request = makeDiagnosticRequest(formData);

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.score).toBeGreaterThanOrEqual(90);
    expect(body.breakdown.totalAlerts).toBe(0);
  });
});
