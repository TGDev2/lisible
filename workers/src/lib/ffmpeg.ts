import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

/**
 * Check if a file is a video format that needs audio extraction
 */
export function isVideoFile(filename: string): boolean {
  const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv'];
  const ext = path.extname(filename).toLowerCase();
  return videoExtensions.includes(ext);
}

/**
 * Check if a file is already an audio format
 */
export function isAudioFile(filename: string): boolean {
  const audioExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.wma'];
  const ext = path.extname(filename).toLowerCase();
  return audioExtensions.includes(ext);
}

/**
 * Get the duration of a media file in seconds using ffprobe
 * @param filePath - Path to the media file
 * @returns Duration in seconds
 */
export async function getMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ];

    const process = spawn('ffprobe', args);
    let output = '';
    let errorOutput = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}: ${errorOutput}`));
        return;
      }

      const duration = parseFloat(output.trim());
      if (isNaN(duration)) {
        reject(new Error(`Could not parse duration from ffprobe output: ${output}`));
        return;
      }

      resolve(duration);
    });

    process.on('error', (err) => {
      reject(new Error(`Failed to spawn ffprobe: ${err.message}. Is ffmpeg installed?`));
    });
  });
}

/**
 * Extract audio from video file and return as buffer
 * @param videoBuffer - Video file as Buffer
 * @param originalFilename - Original filename for format detection
 * @param onProgress - Optional progress callback
 * @returns Audio buffer in mp3 format and duration in seconds
 */
export async function extractAudio(
  videoBuffer: Buffer,
  originalFilename: string,
  onProgress?: (percent: number) => void
): Promise<{ audioBuffer: Buffer; durationSeconds: number }> {
  const tempDir = os.tmpdir();
  const jobId = randomUUID();
  const inputPath = path.join(tempDir, `sme-stt-input-${jobId}${path.extname(originalFilename)}`);
  const outputPath = path.join(tempDir, `sme-stt-output-${jobId}.mp3`);

  try {
    // Write video buffer to temp file
    await fs.promises.writeFile(inputPath, videoBuffer);
    onProgress?.(5);

    // Get duration first for progress tracking
    const durationSeconds = await getMediaDuration(inputPath);
    onProgress?.(10);

    // Extract audio using ffmpeg
    await new Promise<void>((resolve, reject) => {
      const args = [
        '-i', inputPath,
        '-vn',                    // No video
        '-acodec', 'libmp3lame',  // MP3 codec
        '-ab', '128k',            // 128 kbps bitrate
        '-ar', '16000',           // 16kHz sample rate (good for speech)
        '-ac', '1',               // Mono (sufficient for speech)
        '-y',                     // Overwrite output file
        outputPath,
      ];

      const process = spawn('ffmpeg', args);
      let errorOutput = '';

      process.stderr.on('data', (data) => {
        errorOutput += data.toString();

        // Parse ffmpeg progress from stderr
        // Example: "time=00:01:23.45"
        const timeMatch = errorOutput.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
        if (timeMatch) {
          const hours = parseInt(timeMatch[1] || '0', 10);
          const minutes = parseInt(timeMatch[2] || '0', 10);
          const seconds = parseInt(timeMatch[3] || '0', 10);
          const currentTime = hours * 3600 + minutes * 60 + seconds;
          const progress = Math.min(90, 10 + (currentTime / durationSeconds) * 80);
          onProgress?.(Math.round(progress));
        }
      });

      process.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg exited with code ${code}: ${errorOutput.slice(-500)}`));
          return;
        }
        resolve();
      });

      process.on('error', (err) => {
        reject(new Error(`Failed to spawn ffmpeg: ${err.message}. Is ffmpeg installed?`));
      });
    });

    onProgress?.(95);

    // Read the output audio file
    const audioBuffer = await fs.promises.readFile(outputPath);
    onProgress?.(100);

    return { audioBuffer, durationSeconds };
  } finally {
    // Cleanup temp files
    try {
      await fs.promises.unlink(inputPath).catch(() => {});
      await fs.promises.unlink(outputPath).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Prepare file for STT processing
 * If video, extracts audio. If audio, returns as-is with duration.
 * @param fileBuffer - File buffer
 * @param filename - Original filename
 * @param onProgress - Progress callback
 * @returns Audio buffer ready for STT and duration
 */
export async function prepareForSTT(
  fileBuffer: Buffer,
  filename: string,
  onProgress?: (percent: number) => void
): Promise<{ audioBuffer: Buffer; durationSeconds: number; wasVideo: boolean }> {
  if (isVideoFile(filename)) {
    const { audioBuffer, durationSeconds } = await extractAudio(fileBuffer, filename, onProgress);
    return { audioBuffer, durationSeconds, wasVideo: true };
  }

  // For audio files, just get the duration
  const tempDir = os.tmpdir();
  const jobId = randomUUID();
  const tempPath = path.join(tempDir, `sme-stt-temp-${jobId}${path.extname(filename)}`);

  try {
    await fs.promises.writeFile(tempPath, fileBuffer);
    const durationSeconds = await getMediaDuration(tempPath);
    return { audioBuffer: fileBuffer, durationSeconds, wasVideo: false };
  } finally {
    await fs.promises.unlink(tempPath).catch(() => {});
  }
}
