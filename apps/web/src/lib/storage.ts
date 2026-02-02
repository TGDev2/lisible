import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  type PutObjectCommandInput,
  type GetObjectCommandInput,
  type DeleteObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";

// Scaleway S3-compatible configuration (Paris fr-par)
const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT || "https://s3.fr-par.scw.cloud",
  region: process.env.S3_REGION || "fr-par",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: true, // Required for Scaleway S3
});

const BUCKET = process.env.S3_BUCKET || "sme-studio-dev";

// Default signed URL expiration: 1 hour (3600 seconds)
const DEFAULT_URL_EXPIRATION = 3600;

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface SignedUrlOptions {
  expiresIn?: number; // in seconds, default 3600 (1 hour)
}

/**
 * Upload a file to S3 bucket
 * @param key - The object key (path) in the bucket
 * @param body - The file content (Buffer, Readable stream, or string)
 * @param options - Upload options (contentType, metadata)
 */
export async function upload(
  key: string,
  body: Buffer | Uint8Array | string,
  options: UploadOptions = {}
): Promise<{ key: string; bucket: string }> {
  const input: PutObjectCommandInput = {
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: options.contentType,
    Metadata: options.metadata,
  };

  const command = new PutObjectCommand(input);
  await s3Client.send(command);

  return { key, bucket: BUCKET };
}

/**
 * Download a file from S3 bucket
 * @param key - The object key (path) in the bucket
 * @returns The file content as a Buffer
 */
export async function download(key: string): Promise<Buffer> {
  const input: GetObjectCommandInput = {
    Bucket: BUCKET,
    Key: key,
  };

  const command = new GetObjectCommand(input);
  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error(`No body returned for key: ${key}`);
  }

  // Convert stream to buffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

/**
 * Generate a signed URL for downloading a file
 * @param key - The object key (path) in the bucket
 * @param options - Signed URL options (expiresIn defaults to 1 hour)
 * @returns The signed URL
 */
export async function getSignedUrl(
  key: string,
  options: SignedUrlOptions = {}
): Promise<string> {
  const input: GetObjectCommandInput = {
    Bucket: BUCKET,
    Key: key,
  };

  const command = new GetObjectCommand(input);
  const expiresIn = options.expiresIn || DEFAULT_URL_EXPIRATION;

  return awsGetSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate a signed URL for uploading a file (PUT)
 * @param key - The object key (path) in the bucket
 * @param options - Signed URL options (expiresIn defaults to 1 hour)
 * @returns The signed URL for upload
 */
export async function getSignedUploadUrl(
  key: string,
  contentType?: string,
  options: SignedUrlOptions = {}
): Promise<string> {
  const input: PutObjectCommandInput = {
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  };

  const command = new PutObjectCommand(input);
  const expiresIn = options.expiresIn || DEFAULT_URL_EXPIRATION;

  return awsGetSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Delete a file from S3 bucket
 * @param key - The object key (path) in the bucket
 */
export async function deleteObject(key: string): Promise<void> {
  const input: DeleteObjectCommandInput = {
    Bucket: BUCKET,
    Key: key,
  };

  const command = new DeleteObjectCommand(input);
  await s3Client.send(command);
}

// Export the S3 client for advanced use cases
export { s3Client, BUCKET };
