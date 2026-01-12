import assert from 'assert';
import { normalizeEmail } from './utils.js';

describe('normalizeEmail', function() {
  it('should return null for null/undefined input', function() {
    assert.strictEqual(normalizeEmail(null), null);
    assert.strictEqual(normalizeEmail(undefined), null);
    assert.strictEqual(normalizeEmail(''), null);
  });

  it('should lowercase email addresses', function() {
    assert.strictEqual(normalizeEmail('User@Example.COM'), 'user@example.com');
    assert.strictEqual(normalizeEmail('JOHN@COMPANY.ORG'), 'john@company.org');
  });

  it('should remove dots from Gmail local part', function() {
    assert.strictEqual(normalizeEmail('john.doe@gmail.com'), 'johndoe@gmail.com');
    assert.strictEqual(normalizeEmail('j.o.h.n@gmail.com'), 'john@gmail.com');
  });

  it('should remove +suffix from Gmail addresses', function() {
    assert.strictEqual(normalizeEmail('user+tag@gmail.com'), 'user@gmail.com');
    assert.strictEqual(normalizeEmail('user+newsletter@gmail.com'), 'user@gmail.com');
  });

  it('should handle both dots and +suffix for Gmail', function() {
    assert.strictEqual(normalizeEmail('john.doe+work@gmail.com'), 'johndoe@gmail.com');
    assert.strictEqual(normalizeEmail('j.d.+spam@gmail.com'), 'jd@gmail.com');
  });

  it('should treat googlemail.com same as gmail.com', function() {
    assert.strictEqual(normalizeEmail('john.doe@googlemail.com'), 'johndoe@googlemail.com');
    assert.strictEqual(normalizeEmail('user+tag@googlemail.com'), 'user@googlemail.com');
  });

  it('should NOT modify non-Gmail addresses', function() {
    assert.strictEqual(normalizeEmail('john.doe@outlook.com'), 'john.doe@outlook.com');
    assert.strictEqual(normalizeEmail('user+tag@yahoo.com'), 'user+tag@yahoo.com');
    assert.strictEqual(normalizeEmail('j.d.+work@company.org'), 'j.d.+work@company.org');
  });

  it('should handle edge cases', function() {
    assert.strictEqual(normalizeEmail('a@gmail.com'), 'a@gmail.com');
    assert.strictEqual(normalizeEmail('.@gmail.com'), '@gmail.com');
    assert.strictEqual(normalizeEmail('+@gmail.com'), '@gmail.com');
  });
});
