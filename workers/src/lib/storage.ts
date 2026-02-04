import {
  S3Client,
  DeleteObjectCommand,
  ListObjectsV2Command,
  type DeleteObjectCommandInput,
} from "@aws-sdk/client-s3";

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

export { s3Client, BUCKET };
