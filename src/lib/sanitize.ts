/**
 * Lightweight HTML/XSS input sanitizer for user freeform text fields.
 * Strips script tags, event attributes (onerror=, onload=), and javascript: URIs.
 */
export function sanitizeInputText(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') return '';

  return input
    .replace(/<script\b[^<]*>([\s\S]*?)<\/script>/gi, '') // Remove <script> tags
    .replace(/<iframe\b[^<]*>([\s\S]*?)<\/iframe>/gi, '') // Remove <iframe> tags
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')           // Remove inline event handlers (onerror="...", onload="...")
    .replace(/javascript\s*:/gi, 'no-javascript:')       // Neutralize javascript: URIs
    .replace(/<style\b[^<]*>([\s\S]*?)<\/style>/gi, '')   // Remove inline <style> tags
    .trim();
}
