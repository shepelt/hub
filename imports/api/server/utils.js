/**
 * Normalize email for consistent lookups
 * - Lowercase
 * - Gmail: remove dots and +suffix
 */
export function normalizeEmail(email) {
  if (!email) return null;
  let [local, domain] = email.toLowerCase().split('@');
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.split('+')[0].replace(/\./g, '');
  }
  return `${local}@${domain}`;
}
