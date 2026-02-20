import { createHmac } from "node:crypto";

const TOKEN_LIFETIME_SECONDS = 60 * 60; // 1 hour
const JWT_HEADER = { alg: "HS256", typ: "JWT" } as const;

export interface DiagnosticTokenPayload {
  fileId: string;
  type: "diagnostic";
  iat: number;
  exp: number;
}

function getSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET ||
    "dev-insecure-diagnostic-secret-change-me"
  );
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
