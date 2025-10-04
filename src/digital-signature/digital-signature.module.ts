import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { DigitalSignatureController } from './controllers/digital-signature.controller';
import { ProfilZaufanyService } from './services/profil-zaufany.service';
import { QESCertificateService } from './services/qes-certificate.service';
import { XAdESSignatureService } from './services/xades-signature.service';
import { CertificateValidationService } from './services/certificate-validation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'fallback-secret',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [DigitalSignatureController],
  providers: [
    ProfilZaufanyService,
    QESCertificateService,
    XAdESSignatureService,
    CertificateValidationService,
  ],
  exports: [
    ProfilZaufanyService,
    QESCertificateService,
    XAdESSignatureService,
    CertificateValidationService,
  ],
})
export class DigitalSignatureModule {}