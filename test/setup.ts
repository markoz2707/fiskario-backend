import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/fiskario_test';
process.env.KSEF_API_URL = 'https://ksef-test.mf.gov.pl';
process.env.KSEF_SANDBOX_URL = 'https://ksef-demo.mf.gov.pl';
process.env.ZUS_API_URL = 'https://pue.zus.pl';
process.env.ZUS_SANDBOX_URL = 'https://pue-demo.zus.pl';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.GOOGLE_VISION_API_KEY = 'test-vision-key';

// Mock external APIs
jest.mock('axios');

// Only mock modules that are actually installed
try {
  jest.mock('openai');
} catch (error) {
  // Module not installed, skip mocking
}

try {
  jest.mock('@google-cloud/vision');
} catch (error) {
  // Module not installed, skip mocking
}

// Set longer timeout for integration tests
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
  // Helper to create test user
  createTestUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    password: 'hashed-password',
    role: 'USER',
    companyId: 'test-company-id',
    ...overrides,
  }),

  // Helper to create test company
  createTestCompany: (overrides = {}) => ({
    id: 'test-company-id',
    name: 'Test Company',
    nip: '1234567890',
    address: 'Test Address 1',
    ...overrides,
  }),

  // Helper to create test invoice
  createTestInvoice: (overrides = {}) => ({
    id: 'test-invoice-id',
    number: 'FV/2024/001',
    issueDate: new Date('2024-01-15'),
    dueDate: new Date('2024-02-15'),
    amount: 1000,
    currency: 'PLN',
    status: 'ISSUED',
    ...overrides,
  }),

  // Helper to wait for async operations
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  // Helper to generate mock XML
  generateMockKSeFXml: () => `<?xml version="1.0" encoding="UTF-8"?>
<KSeFRequest>
  <Header>
    <Timestamp>2024-01-15T10:00:00Z</Timestamp>
  </Header>
  <Invoice>
    <Number>FV/2024/001</Number>
    <Amount>1000.00</Amount>
  </Invoice>
</KSeFRequest>`,

  // Helper to generate mock JPK XML
  generateMockJPKXml: () => `<?xml version="1.0" encoding="UTF-8"?>
<JPK>
  <Header>
    <Timestamp>2024-01-15T10:00:00Z</Timestamp>
  </Header>
  <Sales>
    <Invoice>
      <Number>FV/2024/001</Number>
      <Amount>1000.00</Amount>
    </Invoice>
  </Sales>
</JPK>`,
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});