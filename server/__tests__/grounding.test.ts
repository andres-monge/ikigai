
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateWithRetry } from '../grounding';

// Mock fetch globally
global.fetch = vi.fn();

describe('generateWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock environment variable
    process.env.GEMINI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return parsed JSON on successful response', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"result": "success", "data": "test"}'
              }
            ]
          }
        }
      ]
    };

    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await generateWithRetry({
      prompt: 'test prompt',
      isJsonMode: true,
    });

    expect(result).toEqual({ result: 'success', data: 'test' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('generateContent'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('test prompt'),
      })
    );
  });

  it('should return text content when not in JSON mode', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'This is a plain text response'
              }
            ]
          }
        }
      ]
    };

    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await generateWithRetry({
      prompt: 'test prompt',
      isJsonMode: false,
    });

    expect(result).toBe('This is a plain text response');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed on third attempt', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"success": true}'
              }
            ]
          }
        }
      ]
    };

    const mockFetch = vi.mocked(fetch);
    
    // First two calls fail with 500 status
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    mockFetch.mockRejectedValueOnce(new Error('Server error'));
    
    // Third call succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    // Mock setTimeout to speed up the test
    vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
      callback();
      return {} as any;
    });

    const result = await generateWithRetry({
      prompt: 'test prompt',
      isJsonMode: true,
      maxRetries: 3,
    });

    expect(result).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('should throw error after max retries are exhausted', async () => {
    const mockFetch = vi.mocked(fetch);
    
    // All calls fail
    mockFetch.mockRejectedValue(new Error('Persistent error'));

    // Mock setTimeout to speed up the test
    vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
      callback();
      return {} as any;
    });

    await expect(
      generateWithRetry({
        prompt: 'test prompt',
        maxRetries: 2,
      })
    ).rejects.toThrow('Persistent error');

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should throw error when response is not ok', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: () => Promise.resolve('Invalid request'),
    } as Response);

    await expect(
      generateWithRetry({
        prompt: 'test prompt',
      })
    ).rejects.toThrow('Gemini API error: 400 Bad Request');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should throw error when response has no content', async () => {
    const mockResponse = {
      candidates: []
    };

    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await expect(
      generateWithRetry({
        prompt: 'test prompt',
      })
    ).rejects.toThrow('No content received from Gemini API');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should throw error when JSON parsing fails', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'invalid json { this is not valid'
              }
            ]
          }
        }
      ]
    };

    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await expect(
      generateWithRetry({
        prompt: 'test prompt',
        isJsonMode: true,
      })
    ).rejects.toThrow();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should throw error when API key is missing', async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(
      generateWithRetry({
        prompt: 'test prompt',
      })
    ).rejects.toThrow('Gemini API key is not configured in .env.local');

    expect(fetch).not.toHaveBeenCalled();
  });

  it('should include search tools when useSearch is true', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'Search response'
              }
            ]
          }
        }
      ]
    };

    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await generateWithRetry({
      prompt: 'test prompt',
      useSearch: true,
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('googleSearchRetrieval'),
      })
    );
  });

  it('should use correct temperature and generation config', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'Response'
              }
            ]
          }
        }
      ]
    };

    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await generateWithRetry({
      prompt: 'test prompt',
      temperature: 0.5,
      isJsonMode: true,
    });

    const callArgs = mockFetch.mock.calls[0];
    const requestBody = JSON.parse(callArgs[1]?.body as string);
    
    expect(requestBody.generationConfig.temperature).toBe(0.5);
    expect(requestBody.generationConfig.response_mime_type).toBe('application/json');
  });
});
