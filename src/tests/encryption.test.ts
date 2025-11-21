import { describe, it, expect, beforeEach } from 'vitest';
import { encryptData, decryptData, saveEncrypted, loadEncrypted, removeEncrypted } from '@/lib/encryption';

describe('Encryption', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should encrypt and decrypt data correctly', async () => {
    const originalData = 'sensitive_api_key_12345';
    const encrypted = await encryptData(originalData);
    const decrypted = await decryptData(encrypted);
    
    expect(decrypted).toBe(originalData);
    expect(encrypted).not.toBe(originalData);
  });

  it('should produce different encrypted outputs for same input', async () => {
    const data = 'test_data';
    const encrypted1 = await encryptData(data);
    const encrypted2 = await encryptData(data);
    
    expect(encrypted1).not.toBe(encrypted2);
    
    const decrypted1 = await decryptData(encrypted1);
    const decrypted2 = await decryptData(encrypted2);
    
    expect(decrypted1).toBe(data);
    expect(decrypted2).toBe(data);
  });

  it('should save and load encrypted data from localStorage', async () => {
    const key = 'test_key';
    const value = 'secret_value';
    
    await saveEncrypted(key, value);
    const loaded = await loadEncrypted(key);
    
    expect(loaded).toBe(value);
    
    const raw = localStorage.getItem(key);
    expect(raw).not.toBe(value);
  });

  it('should return null for non-existent keys', async () => {
    const loaded = await loadEncrypted('non_existent_key');
    expect(loaded).toBeNull();
  });

  it('should remove encrypted data', async () => {
    const key = 'test_key';
    const value = 'test_value';
    
    await saveEncrypted(key, value);
    expect(await loadEncrypted(key)).toBe(value);
    
    removeEncrypted(key);
    expect(await loadEncrypted(key)).toBeNull();
  });

  it('should handle invalid encrypted data gracefully', async () => {
    localStorage.setItem('corrupted_key', 'invalid_base64_data');
    const loaded = await loadEncrypted('corrupted_key');
    expect(loaded).toBeNull();
  });
});
