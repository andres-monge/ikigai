// client/src/lib/__tests__/i18n.test.ts

import { describe, it, expect } from 'vitest';
import { t } from '../i18n';

describe('i18n t() function', () => {
  it('should return the correct English translation for a flat key', () => {
    expect(t('header.title', 'en')).toBe('Purpose Finder');
  });

  it('should return the correct Spanish translation for a flat key', () => {
    expect(t('welcome.startButton', 'es')).toBe('Comienza Tu Viaje');
  });

  it('should return the key itself if the key does not exist', () => {
    expect(t('a.non.existent.key', 'en')).toBe('a.non.existent.key');
  });

  it('should default to English if the language is undefined', () => {
    expect(t('header.title', undefined as any)).toBe('Purpose Finder');
  });

  it('should handle chat translations correctly', () => {
    expect(t('chat.title', 'en')).toBe('Nami');
    expect(t('chat.subtitle', 'en')).toBe('Your AI Career Guide');
    expect(t('chat.placeholder', 'en')).toBe('Ask Nami anything...');
  });

  it('should handle welcome section translations correctly', () => {
    expect(t('welcome.title', 'en')).toBe('Find Your Ikigai');
    expect(t('welcome.subtitle', 'en')).toBe('Discover your reason for being with AI-powered career guidance');
  });
});