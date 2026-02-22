import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_LIFETIME_SECONDS = 60 * 60; // 1 hour
const JWT_HEADER = { alg: "HS256", typ: "JWT" } as const;

export interface DiagnosticTokenPayload {
  fileId: string;
  type: "diagnostic";
  iat: number;
  exp: number;
}

function getSecret(): string {
  const secret =
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Missing AUTH_SECRET (or NEXTAUTH_SECRET/JWT_SECRET) for diagnostic token signing."
    );
  }

  return "dev-insecure-diagnostic-secret-change-me";
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

/**
 * Sign a short-lived JWT used for anonymous diagnostic sessions.
 */
export function createDiagnosticTemporaryToken(fileId: string): string {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const payload: DiagnosticTokenPayload = {
    fileId,
    type: "diagnostic",
    iat: nowInSeconds,
    exp: nowInSeconds + TOKEN_LIFETIME_SECONDS,
  };

  const encodedHeader = encodeBase64Url(JSON.stringify(JWT_HEADER));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const contentToSign = `${encodedHeader}.${encodedPayload}`;

  const signature = createHmac("sha256", getSecret())
    .update(contentToSign)
    .digest("base64url");

  return `${contentToSign}.${signature}`;
}

/**
 * Verify a diagnostic temporary token and return its payload.
 * Returns null if the token is invalid, expired, or doesn't match the fileId.
 */
export function verifyDiagnosticTemporaryToken(
  token: string,
  expectedFileId: string
): DiagnosticTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, providedSignature] = parts as [
    string,
    string,
    string,
  ];

  // Verify signature
  const contentToSign = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = createHmac("sha256", getSecret())
    .update(contentToSign)
    .digest("base64url");

  const sigBuffer = Buffer.from(providedSignature, "base64url");
  const expectedBuffer = Buffer.from(expectedSignature, "base64url");

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return null;
  }

  // Decode and validate payload
  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString()
    ) as DiagnosticTokenPayload;

    if (payload.type !== "diagnostic") return null;
    if (payload.fileId !== expectedFileId) return null;

    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (nowInSeconds > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}
