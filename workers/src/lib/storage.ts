import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  type DeleteObjectCommandInput,
  type GetObjectCommandInput,
  type PutObjectCommandInput,
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

/**
 * Delete all objects with a given prefix
 * @param prefix - The prefix to match (e.g., "users/uuid/")
 */
export async function deleteObjectsByPrefix(prefix: string): Promise<number> {
  let deletedCount = 0;
  let continuationToken: string | undefined;

  do {
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });

    const listResponse = await s3Client.send(listCommand);

    if (listResponse.Contents) {
      for (const object of listResponse.Contents) {
        if (object.Key) {
          await deleteObject(object.Key);
          deletedCount++;
        }
      }
    }

    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);

  return deletedCount;
}

/**
 * Download a file from S3 bucket and return its content as string
 * @param key - The object key (path) in the bucket
 * @returns File content as UTF-8 string
 */
export async function downloadObject(key: string): Promise<string> {
  const input: GetObjectCommandInput = {
    Bucket: BUCKET,
    Key: key,
  };

  const command = new GetObjectCommand(input);
  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error(`Empty response body for key: ${key}`);
  }

  // Convert stream to string
  const content = await response.Body.transformToString("utf-8");
  return content;
}

/**
 * Download a file from S3 bucket and return its content as Buffer
 * @param key - The object key (path) in the bucket
 * @returns File content as Buffer
 */
export async function downloadObjectAsBuffer(key: string): Promise<Buffer> {
  const input: GetObjectCommandInput = {
    Bucket: BUCKET,
    Key: key,
  };

  const command = new GetObjectCommand(input);
  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error(`Empty response body for key: ${key}`);
  }

  // Convert stream to Buffer
  const byteArray = await response.Body.transformToByteArray();
  return Buffer.from(byteArray);
}

/**
 * Upload a file to S3 bucket
 * @param key - The object key (path) in the bucket
 * @param content - File content as string or Buffer
 * @param contentType - MIME type of the file
 */
export async function uploadObject(
  key: string,
  content: string | Buffer,
  contentType: string = "application/octet-stream"
): Promise<void> {
  const input: PutObjectCommandInput = {
    Bucket: BUCKET,
    Key: key,
    Body: content,
    ContentType: contentType,
  };

  const command = new PutObjectCommand(input);
  await s3Client.send(command);
}

/**
 * Generate a signed URL for downloading a file
 * @param key - The object key (path) in the bucket
 * @param expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns The signed URL
 */
export async function getSignedUrl(
  key: string,
  expiresIn: number = 60 * 60 // 1 hour default
): Promise<string> {
  const input: GetObjectCommandInput = {
    Bucket: BUCKET,
    Key: key,
  };

  const command = new GetObjectCommand(input);
  return awsGetSignedUrl(s3Client, command, { expiresIn });
}

export { s3Client, BUCKET };
