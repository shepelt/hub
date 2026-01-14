import crypto from 'crypto';

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

/**
 * Get encryption key from environment variable
 * Key should be 32 bytes (256 bits) hex-encoded
 */
function getEncryptionKey() {
  const key = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!key) {
    throw new Error('API_KEY_ENCRYPTION_SECRET environment variable is required');
  }
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt a string using AES-256-GCM
 * @param {string} plaintext - The text to encrypt
 * @returns {string} - Base64 encoded string containing iv:authTag:ciphertext
 */
export function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  // Combine iv:authTag:ciphertext
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt a string encrypted with encrypt()
 * @param {string} encryptedData - Base64 encoded iv:authTag:ciphertext
 * @returns {string} - Decrypted plaintext
 */
export function decrypt(encryptedData) {
  const key = getEncryptionKey();
  const [ivB64, authTagB64, ciphertext] = encryptedData.split(':');

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
