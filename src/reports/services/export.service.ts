import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
// import { Parser } from 'json2csv'; // Will be added when dependency is installed

export interface ExportOptions {
  format: 'csv' | 'xlsx' | 'pdf';
  includeHeaders?: boolean;
  delimiter?: string;
  encoding?: string;
}

export interface ComplianceHeaders {
  companyName: string;
  companyNIP: string;
  reportType: string;
  period: string;
  generatedAt: Date;
  generatedBy: string;
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);
  private readonly uploadDir = './uploads/exports';

  constructor() {
    this.ensureUploadDirectory();
  }

  async exportToCSV(
    data: any[],
    filename: string,
    options: ExportOptions = { format: 'csv', includeHeaders: true },
    complianceHeaders?: ComplianceHeaders,
  ): Promise<string> {
    try {
      this.logger.log(`Exporting ${data.length} records to CSV: ${filename}`);

      let csvContent = '';

      // Add compliance headers if provided
      if (complianceHeaders) {
        csvContent += this.generateComplianceHeaderCSV(complianceHeaders);
        csvContent += '\n\n';
      }

      // Convert data to CSV
      if (data.length > 0) {
        csvContent += this.convertToCSV(data, options.delimiter || ';');
      }

      // Ensure filename has .csv extension
      const csvFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;

      // Write file
      const filePath = path.join(this.uploadDir, csvFilename);
      await fs.promises.writeFile(filePath, csvContent, options.encoding as BufferEncoding || 'utf8');

      return filePath;
    } catch (error) {
      this.logger.error(`Error exporting to CSV: ${error.message}`, error.stack);
      throw error;
    }
  }

  async exportToXLSX(
    data: any[],
    filename: string,
    options: ExportOptions = { format: 'xlsx' },
    complianceHeaders?: ComplianceHeaders,
  ): Promise<string> {
    try {
      this.logger.log(`Exporting ${data.length} records to XLSX: ${filename}`);

      // For now, we'll create a CSV file and rename it to .xlsx
      // In a production environment, you'd use a library like 'exceljs' or 'xlsx'
      const csvPath = await this.exportToCSV(data, filename.replace('.xlsx', '.csv'), options, complianceHeaders);
      const xlsxPath = csvPath.replace('.csv', '.xlsx');

      // Rename file (simplified - in reality use proper XLSX library)
      await fs.promises.rename(csvPath, xlsxPath);

      return xlsxPath;
    } catch (error) {
      this.logger.error(`Error exporting to XLSX: ${error.message}`, error.stack);
      throw error;
    }
  }

  async exportToPDF(
    data: any[],
    filename: string,
    options: ExportOptions = { format: 'pdf' },
    complianceHeaders?: ComplianceHeaders,
    title?: string,
  ): Promise<string> {
    try {
      this.logger.log(`Exporting ${data.length} records to PDF: ${filename}`);

      // For now, we'll create a simple HTML file and convert concepts
      // In a production environment, you'd use a library like 'puppeteer' or 'pdfkit'
      const htmlContent = this.generateHTMLReport(data, complianceHeaders, title);

      const htmlFilename = filename.endsWith('.html') ? filename : `${filename}.html`;
      const filePath = path.join(this.uploadDir, htmlFilename);

      await fs.promises.writeFile(filePath, htmlContent, 'utf8');

      // In a real implementation, you'd convert HTML to PDF here
      const pdfPath = filePath.replace('.html', '.pdf');
      // await this.convertHTMLToPDF(filePath, pdfPath);

      return pdfPath;
    } catch (error) {
      this.logger.error(`Error exporting to PDF: ${error.message}`, error.stack);
      throw error;
    }
  }

  private generateComplianceHeaderCSV(headers: ComplianceHeaders): string {
    const complianceData = [
      { field: 'Raport wygenerowany przez', value: 'Fiskario' },
      { field: 'Firma', value: headers.companyName },
      { field: 'NIP', value: headers.companyNIP },
      { field: 'Typ raportu', value: headers.reportType },
      { field: 'Okres', value: headers.period },
      { field: 'Data generowania', value: headers.generatedAt.toLocaleString('pl-PL') },
      { field: 'Wygenerowane przez', value: headers.generatedBy },
      { field: '', value: '' },
      { field: 'Zgodność z przepisami', value: 'RODO/GDPR, Ustawa o rachunkowości' },
      { field: 'Retencja danych', value: '5 lat zgodnie z przepisami podatkowymi' },
    ];

    return this.convertToCSV(complianceData, ';');
  }

  private convertToCSV(data: any[], delimiter: string = ';'): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvRows: string[] = [];

    // Add headers
    csvRows.push(headers.join(delimiter));

    // Add data rows
    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header] || '';
        // Escape quotes and wrap in quotes if contains delimiter or quotes
        if (typeof value === 'string' && (value.includes(delimiter) || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvRows.push(values.join(delimiter));
    }

    return csvRows.join('\n');
  }

  private generateHTMLReport(
    data: any[],
    complianceHeaders?: ComplianceHeaders,
    title?: string,
  ): string {
    let html = `
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title || 'Raport Fiskario'}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { border-bottom: 2px solid #333; margin-bottom: 20px; padding-bottom: 10px; }
        .compliance-info { background-color: #f5f5f5; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        .summary { background-color: #e8f4f8; padding: 15px; margin-top: 20px; border-radius: 5px; }
        .footer { margin-top: 30px; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 10px; }
    </style>
</head>
<body>
`;

    // Add compliance header
    if (complianceHeaders) {
      html += `
    <div class="header">
        <h1>${title || 'Raport Fiskario'}</h1>
        <div class="compliance-info">
            <h3>Informacje o raporcie</h3>
            <p><strong>Firma:</strong> ${complianceHeaders.companyName}</p>
            <p><strong>NIP:</strong> ${complianceHeaders.companyNIP}</p>
            <p><strong>Typ raportu:</strong> ${complianceHeaders.reportType}</p>
            <p><strong>Okres:</strong> ${complianceHeaders.period}</p>
            <p><strong>Data generowania:</strong> ${complianceHeaders.generatedAt.toLocaleString('pl-PL')}</p>
            <p><strong>Wygenerowane przez:</strong> ${complianceHeaders.generatedBy}</p>
        </div>
    </div>
`;
    }

    // Add data table
    if (data.length > 0) {
      const columns = Object.keys(data[0]);
      html += '<table>';

      // Table header
      html += '<thead><tr>';
      columns.forEach(col => {
        html += `<th>${this.formatColumnName(col)}</th>`;
      });
      html += '</tr></thead>';

      // Table body
      html += '<tbody>';
      data.forEach(row => {
        html += '<tr>';
        columns.forEach(col => {
          html += `<td>${row[col] || ''}</td>`;
        });
        html += '</tr>';
      });
      html += '</tbody></table>';
    }

    // Add summary if applicable
    if (data.length > 0) {
      html += `
    <div class="summary">
        <h3>Podsumowanie</h3>
        <p>Liczba rekordów: ${data.length}</p>
        <p>Wygenerowano: ${new Date().toLocaleString('pl-PL')}</p>
    </div>
`;
    }

    // Add footer
    html += `
    <div class="footer">
        <p>Ten raport został wygenerowany automatycznie przez system Fiskario.</p>
        <p>Dane są zgodne z przepisami RODO/GDPR oraz polskimi przepisami podatkowymi.</p>
        <p>Retencja danych: 5 lat zgodnie z art. 74 ustawy o rachunkowości.</p>
    </div>
`;

    html += '</body></html>';

    return html;
  }

  private formatColumnName(columnName: string): string {
    // Convert camelCase to readable Polish format
    const formatted = columnName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();

    // Translate common terms to Polish
    const translations: Record<string, string> = {
      'amount': 'Kwota',
      'date': 'Data',
      'total': 'Razem',
      'net': 'Netto',
      'vat': 'VAT',
      'gross': 'Brutto',
      'name': 'Nazwa',
      'number': 'Numer',
      'period': 'Okres',
      'status': 'Status',
      'count': 'Liczba',
    };

    return translations[formatted.toLowerCase()] || formatted;
  }

  private ensureUploadDirectory(): void {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Created upload directory: ${this.uploadDir}`);
    }
  }

  async cleanupOldExports(maxAgeHours: number = 24): Promise<number> {
    try {
      const files = await fs.promises.readdir(this.uploadDir);
      const now = Date.now();
      const maxAge = maxAgeHours * 60 * 60 * 1000;

      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.uploadDir, file);
        const stats = await fs.promises.stat(filePath);

        if (now - stats.mtime.getTime() > maxAge) {
          await fs.promises.unlink(filePath);
          deletedCount++;
          this.logger.log(`Deleted old export file: ${file}`);
        }
      }

      return deletedCount;
    } catch (error) {
      this.logger.error(`Error cleaning up old exports: ${error.message}`, error.stack);
      return 0;
    }
  }

  getExportFileUrl(filePath: string): string {
    // Return relative URL for the exported file
    const relativePath = path.relative('./uploads', filePath);
    return `/uploads/exports/${relativePath}`;
  }
}