import { registerAs } from '@nestjs/config';

export interface EDeklaracjeEnvironmentConfig {
  testEnvironment: boolean;
  soap: {
    timeout: number;
    retries: number;
    testWsdlUrl: string;
    productionWsdlUrl: string;
  };
  certificates: {
    defaultCertificatePath: string;
    defaultPrivateKeyPath: string;
    passphrase?: string;
  };
  authentication: {
    profilZaufany: {
      apiUrl: string;
      clientId: string;
      clientSecret: string;
    };
  };
  monitoring: {
    statusCheckInterval: number; // minutes
    enableAutoCheck: boolean;
    maxRetries: number;
    retryBaseDelay: number; // milliseconds
  };
}

export const eDeklaracjeConfig = registerAs('eDeklaracje', (): EDeklaracjeEnvironmentConfig => ({
  testEnvironment: process.env.EDEKLARACJE_TEST_ENV === 'true' || process.env.NODE_ENV !== 'production',

  soap: {
    timeout: parseInt(process.env.EDEKLARACJE_SOAP_TIMEOUT || '30000', 10),
    retries: parseInt(process.env.EDEKLARACJE_SOAP_RETRIES || '3', 10),
    testWsdlUrl: process.env.EDEKLARACJE_TEST_WSDL_URL || 'https://test-e-deklaracje.mf.gov.pl/ws/e-Deklaracje.wsdl',
    productionWsdlUrl: process.env.EDEKLARACJE_PRODUCTION_WSDL_URL || 'https://e-deklaracje.mf.gov.pl/ws/e-Deklaracje.wsdl'
  },

  certificates: {
    defaultCertificatePath: process.env.EDEKLARACJE_CERT_PATH || '/etc/ssl/certs/e-deklaracje.crt',
    defaultPrivateKeyPath: process.env.EDEKLARACJE_KEY_PATH || '/etc/ssl/private/e-deklaracje.key',
    passphrase: process.env.EDEKLARACJE_CERT_PASSPHRASE
  },

  authentication: {
    profilZaufany: {
      apiUrl: process.env.PROFIL_ZAUFANY_API_URL || 'https://pz.gov.pl/api',
      clientId: process.env.PROFIL_ZAUFANY_CLIENT_ID || '',
      clientSecret: process.env.PROFIL_ZAUFANY_CLIENT_SECRET || ''
    }
  },

  monitoring: {
    statusCheckInterval: parseInt(process.env.EDEKLARACJE_STATUS_CHECK_INTERVAL || '15', 10),
    enableAutoCheck: process.env.EDEKLARACJE_AUTO_CHECK === 'true',
    maxRetries: parseInt(process.env.EDEKLARACJE_MAX_RETRIES || '3', 10),
    retryBaseDelay: parseInt(process.env.EDEKLARACJE_RETRY_DELAY || '5000', 10)
  }
}));

// Environment-specific configurations
export const testEnvironmentConfig: Partial<EDeklaracjeEnvironmentConfig> = {
  testEnvironment: true,
  soap: {
    timeout: 15000,
    retries: 2,
    testWsdlUrl: 'https://test-e-deklaracje.mf.gov.pl/ws/e-Deklaracje.wsdl',
    productionWsdlUrl: 'https://e-deklaracje.mf.gov.pl/ws/e-Deklaracje.wsdl'
  },
  monitoring: {
    statusCheckInterval: 5, // More frequent checks in test environment
    enableAutoCheck: true,
    maxRetries: 2,
    retryBaseDelay: 2000
  }
};

export const productionEnvironmentConfig: Partial<EDeklaracjeEnvironmentConfig> = {
  testEnvironment: false,
  soap: {
    timeout: 60000,
    retries: 5,
    testWsdlUrl: 'https://test-e-deklaracje.mf.gov.pl/ws/e-Deklaracje.wsdl',
    productionWsdlUrl: 'https://e-deklaracje.mf.gov.pl/ws/e-Deklaracje.wsdl'
  },
  monitoring: {
    statusCheckInterval: 30, // Less frequent checks in production
    enableAutoCheck: true,
    maxRetries: 5,
    retryBaseDelay: 10000
  }
};

// Get environment-specific configuration
export function getEnvironmentConfig(): Partial<EDeklaracjeEnvironmentConfig> {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isTest = process.env.EDEKLARACJE_TEST_ENV === 'true';

  if (isTest) {
    return testEnvironmentConfig;
  }

  switch (nodeEnv) {
    case 'production':
      return productionEnvironmentConfig;
    case 'test':
      return testEnvironmentConfig;
    default:
      return testEnvironmentConfig; // Default to test environment for development
  }
}

// Validate configuration
export function validateEDeklaracjeConfig(config: EDeklaracjeEnvironmentConfig): string[] {
  const errors: string[] = [];

  if (!config.soap.testWsdlUrl) {
    errors.push('EDEKLARACJE_TEST_WSDL_URL is required');
  }

  if (!config.soap.productionWsdlUrl) {
    errors.push('EDEKLARACJE_PRODUCTION_WSDL_URL is required');
  }

  if (!config.certificates.defaultCertificatePath) {
    errors.push('EDEKLARACJE_CERT_PATH is required');
  }

  if (!config.certificates.defaultPrivateKeyPath) {
    errors.push('EDEKLARACJE_KEY_PATH is required');
  }

  if (config.monitoring.statusCheckInterval < 1) {
    errors.push('EDEKLARACJE_STATUS_CHECK_INTERVAL must be at least 1 minute');
  }

  if (config.monitoring.maxRetries < 1) {
    errors.push('EDEKLARACJE_MAX_RETRIES must be at least 1');
  }

  return errors;
}