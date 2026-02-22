// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDiagnosticTemporaryToken,
  verifyDiagnosticTemporaryToken,
} from "@/lib/diagnostic-token";

vi.mock("@/lib/redis", () => ({
  setDiagnosticResult: vi.fn().mockResolvedValue(true),
  getDiagnosticResult: vi.fn().mockResolvedValue(null),
}));

const FILE_ID = "test-file-id-123";

const STORED_RESULT = JSON.stringify({
  fileId: FILE_ID,
  score: { score: 75, breakdown: {
    totalAlerts: 5,
    bySeverity: { critical: 1, warning: 2, info: 2 },
    byRule: {
      speed: { count: 1, penalty: 10 },
      length: { count: 2, penalty: 10 },
      overlap: { count: 0, penalty: 0 },
      duration: { count: 0, penalty: 0 },
      proper_noun: { count: 2, penalty: 2 },
    },
    totalPenalty: 22,
  }},
  topAlerts: [
    { ruleCode: "speed", severity: "critical", message: "Vitesse de lecture excessive", count: 1 },
    { ruleCode: "length", severity: "warning", message: "Segments trop longs", count: 2 },
    { ruleCode: "proper_noun", severity: "info", message: "Noms propres à vérifier", count: 2 },
  ],
  fileName: "test.srt",
  format: "srt",
  segmentCount: 20,
  createdAt: "2026-02-22T10:00:00.000Z",
});

function makeResultRequest(
  fileId: string,
  token?: string,
  tokenLocation:
    | "header"
    | "temporaryHeader"
    | "queryTemporaryToken"
    | "queryLegacyToken" = "header"
): Request {
  const baseUrl = `http://localhost/api/diagnostic/${fileId}/result`;
  const url =
    tokenLocation === "queryTemporaryToken" && token
      ? `${baseUrl}?temporaryToken=${token}`
      : tokenLocation === "queryLegacyToken" && token
        ? `${baseUrl}?token=${token}`
        : baseUrl;

  const headers: Record<string, string> = {};
  if (token && tokenLocation === "header") {
    headers["authorization"] = `Bearer ${token}`;
  }
  if (token && tokenLocation === "temporaryHeader") {
    headers["x-temporary-token"] = token;
  }

  return new Request(url, { method: "GET", headers });
}

describe("GET /api/diagnostic/[fileId]/result", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns diagnostic result with valid token in Authorization header", async () => {
    const { getDiagnosticResult } = await import("@/lib/redis");
    vi.mocked(getDiagnosticResult).mockResolvedValueOnce(STORED_RESULT);

    const token = createDiagnosticTemporaryToken(FILE_ID);
    const { GET } = await import(
      "@/app/api/diagnostic/[fileId]/result/route"
    );

    const request = makeResultRequest(FILE_ID, token, "header");
    const response = await GET(request as never, {
      params: Promise.resolve({ fileId: FILE_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fileId).toBe(FILE_ID);
    expect(body.score).toBe(75);
    expect(body.breakdown.bySeverity.critical).toBe(1);
    expect(body.breakdown.bySeverity.warning).toBe(2);
    expect(body.breakdown.bySeverity.info).toBe(2);
    expect(body.topAlerts).toHaveLength(3);
    expect(body.topAlerts[0].ruleCode).toBe("speed");
    expect(body.topAlerts[0].severity).toBe("critical");
    expect(body.fileName).toBe("test.srt");
    expect(body.format).toBe("srt");
    expect(body.segmentCount).toBe(20);
  });

  it("returns diagnostic result with valid token in temporaryToken query param", async () => {
    const { getDiagnosticResult } = await import("@/lib/redis");
    vi.mocked(getDiagnosticResult).mockResolvedValueOnce(STORED_RESULT);

    const token = createDiagnosticTemporaryToken(FILE_ID);
    const { GET } = await import(
      "@/app/api/diagnostic/[fileId]/result/route"
    );

    const request = makeResultRequest(FILE_ID, token, "queryTemporaryToken");
    const response = await GET(request as never, {
      params: Promise.resolve({ fileId: FILE_ID }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.score).toBe(75);
  });

  it("returns diagnostic result with valid token in x-temporary-token header", async () => {
    const { getDiagnosticResult } = await import("@/lib/redis");
    vi.mocked(getDiagnosticResult).mockResolvedValueOnce(STORED_RESULT);

    const token = createDiagnosticTemporaryToken(FILE_ID);
    const { GET } = await import(
      "@/app/api/diagnostic/[fileId]/result/route"
    );

    const request = makeResultRequest(FILE_ID, token, "temporaryHeader");
    const response = await GET(request as never, {
      params: Promise.resolve({ fileId: FILE_ID }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.score).toBe(75);
  });

  it("returns diagnostic result with valid token in legacy token query param", async () => {
    const { getDiagnosticResult } = await import("@/lib/redis");
    vi.mocked(getDiagnosticResult).mockResolvedValueOnce(STORED_RESULT);

    const token = createDiagnosticTemporaryToken(FILE_ID);
    const { GET } = await import(
      "@/app/api/diagnostic/[fileId]/result/route"
    );

    const request = makeResultRequest(FILE_ID, token, "queryLegacyToken");
    const response = await GET(request as never, {
      params: Promise.resolve({ fileId: FILE_ID }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.score).toBe(75);
  });

  it("returns 401 when no token is provided", async () => {
    const { GET } = await import(
      "@/app/api/diagnostic/[fileId]/result/route"
    );

    const request = makeResultRequest(FILE_ID);
    const response = await GET(request as never, {
      params: Promise.resolve({ fileId: FILE_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toContain("Token d'accès manquant");
  });

  it("returns 401 for an invalid token", async () => {
    const { GET } = await import(
      "@/app/api/diagnostic/[fileId]/result/route"
    );

    const request = makeResultRequest(FILE_ID, "invalid.token.here", "header");
    const response = await GET(request as never, {
      params: Promise.resolve({ fileId: FILE_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toContain("Token invalide ou expiré");
  });

  it("returns 401 when token belongs to a different fileId", async () => {
    const { GET } = await import(
      "@/app/api/diagnostic/[fileId]/result/route"
    );

    const tokenForOtherFile = createDiagnosticTemporaryToken("other-file-id");
    const request = makeResultRequest(FILE_ID, tokenForOtherFile, "header");
    const response = await GET(request as never, {
      params: Promise.resolve({ fileId: FILE_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toContain("Token invalide ou expiré");
  });

  it("returns 404 when result is not found in Redis", async () => {
    const { getDiagnosticResult } = await import("@/lib/redis");
    vi.mocked(getDiagnosticResult).mockResolvedValueOnce(null);

    const token = createDiagnosticTemporaryToken(FILE_ID);
    const { GET } = await import(
      "@/app/api/diagnostic/[fileId]/result/route"
    );

    const request = makeResultRequest(FILE_ID, token, "header");
    const response = await GET(request as never, {
      params: Promise.resolve({ fileId: FILE_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain("Résultat non trouvé ou expiré");
  });

  it("returns topAlerts as empty array when not stored (backward compat)", async () => {
    const { getDiagnosticResult } = await import("@/lib/redis");
    // Simulate old format without topAlerts
    const oldFormatResult = JSON.stringify({
      fileId: FILE_ID,
      score: { score: 85, breakdown: {
        totalAlerts: 2,
        bySeverity: { critical: 0, warning: 1, info: 1 },
        byRule: {
          speed: { count: 0, penalty: 0 },
          length: { count: 1, penalty: 5 },
          overlap: { count: 0, penalty: 0 },
          duration: { count: 0, penalty: 0 },
          proper_noun: { count: 1, penalty: 1 },
        },
        totalPenalty: 6,
      }},
      fileName: "old.srt",
      format: "srt",
      segmentCount: 10,
      createdAt: "2026-02-22T10:00:00.000Z",
    });
    vi.mocked(getDiagnosticResult).mockResolvedValueOnce(oldFormatResult);

    const token = createDiagnosticTemporaryToken(FILE_ID);
    const { GET } = await import(
      "@/app/api/diagnostic/[fileId]/result/route"
    );

    const request = makeResultRequest(FILE_ID, token, "header");
    const response = await GET(request as never, {
      params: Promise.resolve({ fileId: FILE_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.topAlerts).toEqual([]);
    expect(body.score).toBe(85);
  });

  it("returns at most 3 top alerts", async () => {
    const { getDiagnosticResult } = await import("@/lib/redis");
    const tooManyAlertsResult = JSON.stringify({
      fileId: FILE_ID,
      score: {
        score: 55,
        breakdown: {
          totalAlerts: 8,
          bySeverity: { critical: 2, warning: 3, info: 3 },
          byRule: {
            speed: { count: 2, penalty: 20 },
            length: { count: 2, penalty: 10 },
            overlap: { count: 2, penalty: 10 },
            duration: { count: 1, penalty: 5 },
            proper_noun: { count: 1, penalty: 1 },
          },
          totalPenalty: 46,
        },
      },
      topAlerts: [
        { ruleCode: "speed", severity: "critical", message: "Vitesse de lecture excessive", count: 2 },
        { ruleCode: "length", severity: "warning", message: "Segments trop longs", count: 2 },
        { ruleCode: "overlap", severity: "warning", message: "Chevauchements temporels", count: 2 },
        { ruleCode: "duration", severity: "warning", message: "Durée d'affichage insuffisante", count: 1 },
      ],
      fileName: "many-alerts.srt",
      format: "srt",
      segmentCount: 30,
      createdAt: "2026-02-22T10:00:00.000Z",
    });
    vi.mocked(getDiagnosticResult).mockResolvedValueOnce(tooManyAlertsResult);

    const token = createDiagnosticTemporaryToken(FILE_ID);
    const { GET } = await import(
      "@/app/api/diagnostic/[fileId]/result/route"
    );

    const request = makeResultRequest(FILE_ID, token, "header");
    const response = await GET(request as never, {
      params: Promise.resolve({ fileId: FILE_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.topAlerts).toHaveLength(3);
  });
});

describe("verifyDiagnosticTemporaryToken", () => {
  it("returns payload for a valid token", () => {
    const token = createDiagnosticTemporaryToken("file-abc");
    const result = verifyDiagnosticTemporaryToken(token, "file-abc");

    expect(result).not.toBeNull();
    expect(result!.fileId).toBe("file-abc");
    expect(result!.type).toBe("diagnostic");
  });

  it("returns null for a tampered token", () => {
    const token = createDiagnosticTemporaryToken("file-abc");
    const tampered = token.slice(0, -4) + "XXXX";
    const result = verifyDiagnosticTemporaryToken(tampered, "file-abc");

    expect(result).toBeNull();
  });

  it("returns null when fileId does not match", () => {
    const token = createDiagnosticTemporaryToken("file-abc");
    const result = verifyDiagnosticTemporaryToken(token, "file-xyz");

    expect(result).toBeNull();
  });

  it("returns null for malformed token", () => {
    expect(verifyDiagnosticTemporaryToken("not-a-jwt", "file-abc")).toBeNull();
    expect(verifyDiagnosticTemporaryToken("", "file-abc")).toBeNull();
    expect(verifyDiagnosticTemporaryToken("a.b", "file-abc")).toBeNull();
  });

  it("throws in production when no secret is configured", () => {
    const env = process.env as Record<string, string | undefined>;
    const previousNodeEnv = env.NODE_ENV;
    const previousAuthSecret = env.AUTH_SECRET;
    const previousNextAuthSecret = env.NEXTAUTH_SECRET;
    const previousJwtSecret = env.JWT_SECRET;

    try {
      env.NODE_ENV = "production";
      delete env.AUTH_SECRET;
      delete env.NEXTAUTH_SECRET;
      delete env.JWT_SECRET;

      expect(() => createDiagnosticTemporaryToken("file-prod")).toThrow(
        "Missing AUTH_SECRET"
      );
    } finally {
      if (previousNodeEnv === undefined) {
        delete env.NODE_ENV;
      } else {
        env.NODE_ENV = previousNodeEnv;
      }

      if (previousAuthSecret === undefined) {
        delete env.AUTH_SECRET;
      } else {
        env.AUTH_SECRET = previousAuthSecret;
      }

      if (previousNextAuthSecret === undefined) {
        delete env.NEXTAUTH_SECRET;
      } else {
        env.NEXTAUTH_SECRET = previousNextAuthSecret;
      }

      if (previousJwtSecret === undefined) {
        delete env.JWT_SECRET;
      } else {
        env.JWT_SECRET = previousJwtSecret;
      }
    }
  });
});
