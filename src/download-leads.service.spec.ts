import { BadRequestException } from '@nestjs/common';
import { DownloadLeadsService } from './download-leads.service';

describe('DownloadLeadsService.fetchFinaraLeads', () => {
  let service: DownloadLeadsService;
  const realFetch = global.fetch;
  const savedKey = process.env.FINARA_API_KEY;
  const savedUrl = process.env.FINARA_API_URL;

  beforeEach(() => {
    service = new DownloadLeadsService();
    delete process.env.FINARA_API_KEY;
    delete process.env.FINARA_API_URL;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  afterAll(() => {
    if (savedKey !== undefined) process.env.FINARA_API_KEY = savedKey;
    if (savedUrl !== undefined) process.env.FINARA_API_URL = savedUrl;
  });

  it('throws when FINARA_API_KEY is not configured', async () => {
    await expect(service.fetchFinaraLeads()).rejects.toThrow(
      'FINARA_API_KEY is not configured on the server.',
    );
  });

  it('returns the parsed lead array on success', async () => {
    process.env.FINARA_API_KEY = 'test-key';
    const leads = [
      {
        id: 7,
        name: 'Rex Domingo',
        company: 'ABC Trading',
        email: 'rextechpos@gmail.com',
        phone: '09357117604',
        message: 'Interested in the Professional plan.',
        source: 'pricing:professional',
        status: 'NEW',
        createdAt: '2026-07-15T03:16:10.569Z',
      },
    ];
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => leads,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(service.fetchFinaraLeads()).resolves.toEqual(leads);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toBe('https://finara.up.railway.app/api/leads/export');
    expect(calledInit.headers['X-API-Key']).toBe('test-key');
  });

  it('honors FINARA_API_URL override', async () => {
    process.env.FINARA_API_KEY = 'test-key';
    process.env.FINARA_API_URL = 'https://finara.example.com';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => [],
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(service.fetchFinaraLeads()).resolves.toEqual([]);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://finara.example.com/api/leads/export');
  });

  it('throws a friendly error on 401', async () => {
    process.env.FINARA_API_KEY = 'bad-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
    }) as unknown as typeof fetch;

    await expect(service.fetchFinaraLeads()).rejects.toThrow(
      'Finara API rejected the key (401 Unauthorized).',
    );
  });

  it('throws when the response is not JSON', async () => {
    process.env.FINARA_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
    }) as unknown as typeof fetch;

    await expect(service.fetchFinaraLeads()).rejects.toThrow(BadRequestException);
  });

  it('throws when the host is unreachable', async () => {
    process.env.FINARA_API_KEY = 'test-key';
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    await expect(service.fetchFinaraLeads()).rejects.toThrow('Could not reach the Finara API.');
  });
});
