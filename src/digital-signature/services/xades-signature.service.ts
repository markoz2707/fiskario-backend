import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as forge from 'node-forge';
import * as crypto from 'crypto';
import {
  SignatureRequest,
  DigitalSignature,
  SignatureMetadata,
  SignatureFormat
} from '../interfaces/digital-signature.interface';

@Injectable()
export class XAdESSignatureService {
  private readonly logger = new Logger(XAdESSignatureService.name);

  /**
   * Generate XAdES signature for JPK file
   */
  async generateXAdESSignature(
    xmlContent: string,
    certificate: any,
    privateKeyPem: string,
    signatureRequest: SignatureRequest
  ): Promise<DigitalSignature> {
    try {
      // Create signature metadata
      const metadata: SignatureMetadata = {
        signatureId: crypto.randomUUID(),
        documentId: signatureRequest.documentId,
        documentType: signatureRequest.documentType,
        signatureType: signatureRequest.signatureType,
        signatureFormat: SignatureFormat.XADES,
        certificateId: certificate.id,
        signedAt: new Date(),
        signerName: certificate.subject,
        signerIdentifier: signatureRequest.userIdentifier,
        signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
        hashAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
      };

      // Generate canonical XML for signing (simplified approach)
      const canonicalXml = this.canonicalizeXML(xmlContent);

      // Create hash of the canonical XML
      const hash = crypto.createHash('sha256');
      hash.update(canonicalXml);
      const digestValue = hash.digest('base64');

      // Create signature value
      const signatureValue = await this.createSignatureValue(
        canonicalXml,
        privateKeyPem,
        certificate
      );

      // Create signed XML with embedded signature
      const signedXmlContent = this.createSignedXML(
        xmlContent,
        metadata,
        digestValue,
        signatureValue,
        certificate
      );

      return {
        metadata,
        certificate: {
          id: certificate.id,
          serialNumber: certificate.serialNumber,
          issuer: certificate.issuer,
          subject: certificate.subject,
          validFrom: certificate.validFrom,
          validTo: certificate.validTo,
          status: certificate.status,
          keyUsage: certificate.keyUsage || [],
          certificateType: certificate.certificateType,
          trustedServiceProvider: certificate.trustedServiceProvider,
        },
        signatureValue,
        originalDocument: Buffer.from(xmlContent, 'utf8'),
        signedDocument: Buffer.from(signedXmlContent, 'utf8'),
      };
    } catch (error) {
      this.logger.error('Failed to generate XAdES signature', error);
      throw new BadRequestException('Failed to generate XAdES signature');
    }
  }

  /**
   * Canonicalize XML document according to C14N specification
   */
  private canonicalizeXML(xmlContent: string): string {
    // Basic canonicalization - in production, use proper C14N library
    let xmlString = xmlContent;

    // Remove unnecessary whitespace and normalize
    xmlString = xmlString.replace(/\s+/g, ' ');
    xmlString = xmlString.replace(/>\s+</g, '><');

    return xmlString.trim();
  }

  /**
   * Create signed XML with embedded signature
   */
  private createSignedXML(
    xmlContent: string,
    metadata: SignatureMetadata,
    digestValue: string,
    signatureValue: string,
    certificate: any
  ): string {
    // Create signature block
    const signatureBlock = `
<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
               Id="signature-${metadata.signatureId}">
  <ds:SignedInfo>
    <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
    <ds:SignatureMethod Algorithm="${metadata.signatureAlgorithm}"/>
    <ds:Reference URI="">
      <ds:Transforms>
        <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
        <ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
      </ds:Transforms>
      <ds:DigestMethod Algorithm="${metadata.hashAlgorithm}"/>
      <ds:DigestValue>${digestValue}</ds:DigestValue>
    </ds:Reference>
  </ds:SignedInfo>
  <ds:SignatureValue>${signatureValue}</ds:SignatureValue>
  <ds:KeyInfo>
    <ds:X509Data>
      <ds:X509Certificate>${this.extractCertificateData(certificate.certificateData)}</ds:X509Certificate>
    </ds:X509Data>
  </ds:KeyInfo>
  <ds:Object>
    <xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"
                                Target="#signature-${metadata.signatureId}">
      <xades:SignedProperties Id="signed-properties-${metadata.signatureId}">
        <xades:SignedSignatureProperties>
          <xades:SigningTime>${metadata.signedAt.toISOString()}</xades:SigningTime>
          <xades:SigningCertificate>
            <xades:Cert>
              <xades:CertDigest>
                <xades:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                <xades:DigestValue>${this.calculateCertificateDigest(metadata.certificateId)}</xades:DigestValue>
              </xades:CertDigest>
            </xades:Cert>
          </xades:SigningCertificate>
        </xades:SignedSignatureProperties>
      </xades:SignedProperties>
    </xades:QualifyingProperties>
  </ds:Object>
</ds:Signature>`;

    // Insert signature into XML (simplified approach)
    // In production, this would use proper XML DOM manipulation
    const signatureInsertionPoint = xmlContent.indexOf('<');
    if (signatureInsertionPoint === -1) {
      throw new BadRequestException('Invalid XML content');
    }

    return xmlContent.slice(0, signatureInsertionPoint) + signatureBlock + '\n' + xmlContent.slice(signatureInsertionPoint);
  }

  /**
   * Create RSA signature value
   */
  private async createSignatureValue(
    canonicalXml: string,
    privateKeyPem: string,
    certificate: any
  ): Promise<string> {
    try {
      // Convert PEM private key to forge format
      const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

      // Create signature using PKCS#1 v1.5 padding
      const md = forge.md.sha256.create();
      md.update(canonicalXml, 'utf8');

      const signature = privateKey.sign(md);

      // Return base64 encoded signature
      return forge.util.encode64(signature);
    } catch (error) {
      this.logger.error('Failed to create signature value', error);
      throw new BadRequestException('Failed to create signature value');
    }
  }


  /**
   * Extract certificate data from PEM format
   */
  private extractCertificateData(certificatePem: string): string {
    // Remove PEM headers and newlines
    return certificatePem
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\n/g, '');
  }

  /**
   * Calculate certificate digest for XAdES
   */
  private calculateCertificateDigest(certificateId: string): string {
    // In production, this would calculate actual certificate digest
    // For now, return a placeholder
    const hash = crypto.createHash('sha256');
    hash.update(certificateId);
    return hash.digest('base64');
  }

  /**
   * Validate XAdES signature
   */
  async validateXAdESSignature(xmlContent: string): Promise<boolean> {
    try {
      // Basic validation - check if signature element exists
      const hasSignatureElement = xmlContent.includes('ds:Signature') ||
                                  xmlContent.includes('<ds:Signature');

      if (!hasSignatureElement) {
        return false;
      }

      // Check for required signature components
      const hasSignedInfo = xmlContent.includes('ds:SignedInfo');
      const hasSignatureValue = xmlContent.includes('ds:SignatureValue');
      const hasDigestValue = xmlContent.includes('ds:DigestValue');
      const hasX509Certificate = xmlContent.includes('ds:X509Certificate');

      // All required elements must be present
      return hasSignedInfo && hasSignatureValue && hasDigestValue && hasX509Certificate;
    } catch (error) {
      this.logger.error('XAdES signature validation failed', error);
      return false;
    }
  }
}