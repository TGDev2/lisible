import React from 'react';
import { renderToBuffer, renderToStream } from '@react-pdf/renderer';
import { ProofDocument } from './templates';
import type { ProofDocumentData, GenerateOptions } from './types';

/**
 * Generate a PDF proof document as a Buffer
 *
 * @param data - The data to include in the PDF
 * @param options - Optional generation options
 * @returns Promise<Buffer> - The generated PDF as a Buffer
 *
 * @example
 * ```typescript
 * const pdfBuffer = await generateProofDocument({
 *   file: {
 *     id: '123',
 *     originalName: 'video.srt',
 *     fileType: 'srt',
 *     segmentCount: 150,
 *     analyzedAt: new Date(),
 *     createdAt: new Date(),
 *   },
 *   score: 85,
 *   breakdown: {
 *     totalAlerts: 5,
 *     bySeverity: { critical: 1, warning: 3, info: 1 },
 *     byRule: {
 *       speed: { count: 2, penalty: 15 },
 *       length: { count: 1, penalty: 5 },
 *       overlap: { count: 0, penalty: 0 },
 *       duration: { count: 1, penalty: 5 },
 *       proper_noun: { count: 1, penalty: 1 },
 *     },
 *   },
 *   alerts: [
 *     {
 *       ruleCode: 'speed',
 *       severity: 'critical',
 *       message: 'Vitesse de lecture trop élevée (25 car/s)',
 *       segmentNum: 12,
 *       details: { actual: 25, max: 20, unit: ' car/s' },
 *     },
 *   ],
 *   userPlan: 'pro',
 * });
 *
 * // Write to file
 * fs.writeFileSync('proof.pdf', pdfBuffer);
 * ```
 */
export async function generateProofDocument(
  data: ProofDocumentData,
  options?: GenerateOptions
): Promise<Buffer> {
  // @react-pdf/renderer expects a generic React element as document input
  const document = React.createElement(ProofDocument, { data, options }) as React.ReactElement;
  const buffer = await renderToBuffer(document);
  return Buffer.from(buffer);
}

/**
 * Generate a PDF proof document as a readable stream
 *
 * @param data - The data to include in the PDF
 * @param options - Optional generation options
 * @returns Promise<NodeJS.ReadableStream> - The generated PDF as a stream
 *
 * @example
 * ```typescript
 * const pdfStream = await generateProofDocumentStream(data);
 *
 * // Pipe to response (e.g., Express)
 * res.setHeader('Content-Type', 'application/pdf');
 * pdfStream.pipe(res);
 * ```
 */
export async function generateProofDocumentStream(
  data: ProofDocumentData,
  options?: GenerateOptions
): Promise<NodeJS.ReadableStream> {
  // @react-pdf/renderer expects a generic React element as document input
  const document = React.createElement(ProofDocument, { data, options }) as React.ReactElement;
  return renderToStream(document);
}

/**
 * Validate proof document data before generation
 *
 * @param data - The data to validate
 * @throws Error if data is invalid
 */
export function validateProofDocumentData(data: ProofDocumentData): void {
  if (!data.file) {
    throw new Error('File metadata is required');
  }
  if (!data.file.originalName) {
    throw new Error('File original name is required');
  }
  if (typeof data.score !== 'number' || data.score < 0 || data.score > 100) {
    throw new Error('Score must be a number between 0 and 100');
  }
  if (!data.breakdown) {
    throw new Error('Score breakdown is required');
  }
  if (!data.alerts || !Array.isArray(data.alerts)) {
    throw new Error('Alerts must be an array');
  }
  if (!['free', 'pro'].includes(data.userPlan)) {
    throw new Error('User plan must be "free" or "pro"');
  }
}

/**
 * Generate proof document with validation
 *
 * @param data - The data to include in the PDF
 * @param options - Optional generation options
 * @returns Promise<Buffer> - The generated PDF as a Buffer
 * @throws Error if data is invalid
 */
export async function generateProofDocumentSafe(
  data: ProofDocumentData,
  options?: GenerateOptions
): Promise<Buffer> {
  validateProofDocumentData(data);
  return generateProofDocument(data, options);
}
