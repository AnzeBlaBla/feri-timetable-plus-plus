/**
 * Utility functions for encoding and decoding group selections
 */

export function encodeGroupSelection(selectedGroups: Record<string, string[]>): string {
  return Buffer.from(JSON.stringify(selectedGroups)).toString('base64url');
}

export function decodeGroupSelection(encodedGroups: string): Record<string, string[]> {
  const decodedString = Buffer.from(encodedGroups, 'base64url').toString('utf-8');
  return JSON.parse(decodedString);
}