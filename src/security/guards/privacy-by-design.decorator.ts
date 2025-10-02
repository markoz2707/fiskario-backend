import { SetMetadata, applyDecorators } from '@nestjs/common';
import { PrivacyMetadata } from '../services/privacy-by-design.service';

export const PRIVACY_METADATA = 'privacy_metadata';

export const PrivacyByDesign = (metadata: PrivacyMetadata) => {
  return applyDecorators(
    SetMetadata(PRIVACY_METADATA, metadata)
  );
};

export const PersonalData = (purpose: string, legalBasis: PrivacyMetadata['legalBasis'] = 'consent') =>
  PrivacyByDesign({
    dataCategory: 'personal',
    purpose,
    legalBasis,
    retentionPeriod: 365,
    accessLevel: 'restricted',
    processingActivities: ['collection', 'storage', 'processing'],
    thirdPartySharing: false,
    crossBorderTransfer: false,
    automatedDecisionMaking: false,
  });

export const SensitiveData = (purpose: string, legalBasis: PrivacyMetadata['legalBasis'] = 'consent') =>
  PrivacyByDesign({
    dataCategory: 'sensitive',
    purpose,
    legalBasis,
    retentionPeriod: 180,
    accessLevel: 'confidential',
    processingActivities: ['collection', 'storage', 'processing'],
    thirdPartySharing: false,
    crossBorderTransfer: false,
    automatedDecisionMaking: false,
  });

export const FinancialData = (purpose: string, legalBasis: PrivacyMetadata['legalBasis'] = 'legal_obligation') =>
  PrivacyByDesign({
    dataCategory: 'financial',
    purpose,
    legalBasis,
    retentionPeriod: 2555, // 7 years for tax purposes
    accessLevel: 'confidential',
    processingActivities: ['collection', 'storage', 'processing', 'reporting'],
    thirdPartySharing: true, // May be shared with tax authorities
    crossBorderTransfer: false,
    automatedDecisionMaking: false,
  });

export const PublicData = (purpose: string) =>
  PrivacyByDesign({
    dataCategory: 'public',
    purpose,
    legalBasis: 'legitimate_interests',
    retentionPeriod: 365,
    accessLevel: 'public',
    processingActivities: ['collection', 'storage', 'processing'],
    thirdPartySharing: true,
    crossBorderTransfer: true,
    automatedDecisionMaking: false,
  });

export const RequiresConsent = (purpose: string) =>
  SetMetadata('requires_consent', purpose);

export const DataProcessingActivity = (activity: string) =>
  SetMetadata('processing_activity', activity);

export const GDPRCompliant = (article: string) =>
  SetMetadata('gdpr_article', article);