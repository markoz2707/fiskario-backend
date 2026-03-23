import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ApiVersioningMiddleware } from './common/middleware/api-versioning.middleware';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Swagger / OpenAPI configuration
  const config = new DocumentBuilder()
    .setTitle('FISKARIO API')
    .setDescription('AI Księgowa - Polish Accounting System API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'Authentication and authorization')
    .addTag('Invoicing', 'Invoice management and KSeF integration')
    .addTag('ZUS', 'Social insurance contributions')
    .addTag('KPiR', 'Revenue and expense ledger')
    .addTag('Declarations', 'Tax declarations and JPK')
    .addTag('Reports', 'Financial reports')
    .addTag('Mobile Sync', 'Mobile synchronization')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // CORS configuration
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:8081', 'http://localhost:19006'],
    credentials: true,
  });

  // Enhanced logging setup for authentication debugging
  logger.log('Starting Fiskario Backend with Enhanced Authentication Logging');
  logger.log(`Debug API Calls: ${process.env.DEBUG_API_CALLS === 'true' ? 'ENABLED' : 'DISABLED'}`);
  logger.log('Authentication Logging: ENABLED');

  // Global exception filter with enhanced error logging
  app.useGlobalFilters(new AllExceptionsFilter());

  // Enable API versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // API versioning middleware
  const versioningMiddleware = new ApiVersioningMiddleware();
  app.use(versioningMiddleware.use.bind(versioningMiddleware));

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  logger.log('Enhanced logging and API versioning middleware registered');
  logger.log('Authentication debugging features enabled: Detailed request/response logging, JWT token validation logging, User context extraction, Authorization header analysis, Error stack traces and context, Authentication flow tracking');

  await app.listen(process.env.PORT ?? 3000);
  logger.log(`Server listening on port ${process.env.PORT ?? 3000}`);
}
bootstrap();
