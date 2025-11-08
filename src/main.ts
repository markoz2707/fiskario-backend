import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ApiVersioningMiddleware } from './common/middleware/api-versioning.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enhanced logging setup for authentication debugging
  console.log('🚀 Starting Fiskario Backend with Enhanced Authentication Logging');
  console.log(`📊 Debug API Calls: ${process.env.DEBUG_API_CALLS === 'true' ? 'ENABLED' : 'DISABLED'}`);
  console.log(`🔐 Authentication Logging: ENABLED`);

  // Global exception filter with enhanced error logging
  app.useGlobalFilters(new AllExceptionsFilter());

  // Enable API versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // API versioning middleware
  app.use(new ApiVersioningMiddleware().use);

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  console.log('✅ Enhanced logging and API versioning middleware registered');
  console.log('🔍 Authentication debugging features enabled:');
  console.log('  - Detailed request/response logging');
  console.log('  - JWT token validation logging');
  console.log('  - User context extraction');
  console.log('  - Authorization header analysis');
  console.log('  - Error stack traces and context');
  console.log('  - Authentication flow tracking');

  await app.listen(process.env.PORT ?? 3000);
  console.log(`🎯 Server listening on port ${process.env.PORT ?? 3000}`);
}
bootstrap();
