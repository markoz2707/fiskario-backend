import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

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

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Fiskario';
      workbook.created = new Date();

      // Add compliance info sheet if complianceHeaders provided
      if (complianceHeaders) {
        const infoSheet = workbook.addWorksheet('Informacje o raporcie');

        const complianceRows = [
          ['Raport wygenerowany przez', 'Fiskario'],
          ['Firma', complianceHeaders.companyName],
          ['NIP', complianceHeaders.companyNIP],
          ['Typ raportu', complianceHeaders.reportType],
          ['Okres', complianceHeaders.period],
          ['Data generowania', complianceHeaders.generatedAt.toLocaleString('pl-PL')],
          ['Wygenerowane przez', complianceHeaders.generatedBy],
          [],
          ['Zgodnosc z przepisami', 'RODO/GDPR, Ustawa o rachunkowosci'],
          ['Retencja danych', '5 lat zgodnie z przepisami podatkowymi'],
        ];

        complianceRows.forEach((row) => {
          infoSheet.addRow(row);
        });

        // Style the label column
        infoSheet.getColumn(1).width = 30;
        infoSheet.getColumn(1).font = { bold: true };
        infoSheet.getColumn(2).width = 50;
      }

      // Add data sheet
      const dataSheet = workbook.addWorksheet('Dane');

      if (data.length > 0) {
        const columns = Object.keys(data[0]);

        // Define columns with headers and approximate widths
        dataSheet.columns = columns.map((col) => ({
          header: this.formatColumnName(col),
          key: col,
          width: Math.max(
            this.formatColumnName(col).length + 4,
            ...data.slice(0, 50).map((row) => {
              const val = row[col];
              return val != null ? String(val).length + 2 : 10;
            }),
            10,
          ),
        }));

        // Style header row
        const headerRow = dataSheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2E7D32' },
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 24;

        // Add data rows
        data.forEach((row) => {
          const dataRow = dataSheet.addRow(row);
          // Format date values for Polish locale
          columns.forEach((col, idx) => {
            const value = row[col];
            if (value instanceof Date) {
              const cell = dataRow.getCell(idx + 1);
              cell.value = value;
              cell.numFmt = 'DD.MM.YYYY';
            }
          });
        });

        // Add alternating row colors for readability
        dataSheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1 && rowNumber % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF5F5F5' },
            };
          }
        });

        // Add auto-filter to header row
        dataSheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: 1, column: columns.length },
        };
      }

      // Ensure filename has .xlsx extension
      const xlsxFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
      const filePath = path.join(this.uploadDir, xlsxFilename);

      await workbook.xlsx.writeFile(filePath);

      this.logger.log(`XLSX export completed: ${filePath}`);
      return filePath;
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

      // Ensure filename has .pdf extension
      const pdfFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
      const filePath = path.join(this.uploadDir, pdfFilename);

      return new Promise<string>((resolve, reject) => {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 40, right: 40 },
          info: {
            Title: title || 'Raport Fiskario',
            Author: 'Fiskario',
            Creator: 'Fiskario Export Service',
          },
        });

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

        // Title header
        doc
          .fontSize(20)
          .font('Helvetica-Bold')
          .text(title || 'Raport Fiskario', { align: 'center' });
        doc.moveDown(0.5);

        // Horizontal rule under title
        doc
          .moveTo(doc.page.margins.left, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y)
          .strokeColor('#2E7D32')
          .lineWidth(2)
          .stroke();
        doc.moveDown(0.8);

        // Compliance info section
        if (complianceHeaders) {
          // Section background
          const infoStartY = doc.y;

          doc
            .fontSize(12)
            .font('Helvetica-Bold')
            .text('Informacje o raporcie');
          doc.moveDown(0.3);

          const complianceFields = [
            ['Firma', complianceHeaders.companyName],
            ['NIP', complianceHeaders.companyNIP],
            ['Typ raportu', complianceHeaders.reportType],
            ['Okres', complianceHeaders.period],
            ['Data generowania', complianceHeaders.generatedAt.toLocaleString('pl-PL')],
            ['Wygenerowane przez', complianceHeaders.generatedBy],
          ];

          doc.fontSize(9).font('Helvetica');
          complianceFields.forEach(([label, value]) => {
            doc
              .font('Helvetica-Bold')
              .text(`${label}: `, { continued: true })
              .font('Helvetica')
              .text(String(value));
          });

          doc.moveDown(0.5);

          // Draw background rectangle behind compliance info
          const infoEndY = doc.y;
          doc
            .save()
            .rect(
              doc.page.margins.left - 5,
              infoStartY - 5,
              pageWidth + 10,
              infoEndY - infoStartY + 5,
            )
            .fillColor('#F5F5F5')
            .fill()
            .restore();

          // Re-draw the compliance text on top of the background
          doc.y = infoStartY;
          doc
            .fontSize(12)
            .font('Helvetica-Bold')
            .fillColor('#000000')
            .text('Informacje o raporcie');
          doc.moveDown(0.3);

          doc.fontSize(9);
          complianceFields.forEach(([label, value]) => {
            doc
              .font('Helvetica-Bold')
              .fillColor('#333333')
              .text(`${label}: `, { continued: true })
              .font('Helvetica')
              .fillColor('#000000')
              .text(String(value));
          });

          doc.moveDown(1);
        }

        // Data table
        if (data.length > 0) {
          const columns = Object.keys(data[0]);
          const colCount = columns.length;
          const colWidth = pageWidth / colCount;
          const rowHeight = 20;
          const headerHeight = 24;
          const fontSize = Math.min(8, Math.max(5, 70 / colCount));

          const drawTableHeader = (startY: number) => {
            // Header background
            doc
              .save()
              .rect(doc.page.margins.left, startY, pageWidth, headerHeight)
              .fillColor('#2E7D32')
              .fill()
              .restore();

            // Header text
            doc.fontSize(fontSize).font('Helvetica-Bold').fillColor('#FFFFFF');
            columns.forEach((col, i) => {
              doc.text(
                this.formatColumnName(col),
                doc.page.margins.left + i * colWidth + 3,
                startY + 6,
                { width: colWidth - 6, height: headerHeight, ellipsis: true },
              );
            });

            return startY + headerHeight;
          };

          let currentY = drawTableHeader(doc.y);

          // Data rows
          doc.fontSize(fontSize).font('Helvetica').fillColor('#000000');

          data.forEach((row, rowIndex) => {
            // Check if we need a new page
            if (currentY + rowHeight > doc.page.height - doc.page.margins.bottom - 40) {
              // Add footer before new page
              this.drawPdfFooter(doc, pageWidth);
              doc.addPage();
              currentY = drawTableHeader(doc.page.margins.top);
              doc.fontSize(fontSize).font('Helvetica').fillColor('#000000');
            }

            // Alternating row background
            if (rowIndex % 2 === 0) {
              doc
                .save()
                .rect(doc.page.margins.left, currentY, pageWidth, rowHeight)
                .fillColor('#FAFAFA')
                .fill()
                .restore();
            }

            // Row border
            doc
              .save()
              .moveTo(doc.page.margins.left, currentY + rowHeight)
              .lineTo(doc.page.margins.left + pageWidth, currentY + rowHeight)
              .strokeColor('#E0E0E0')
              .lineWidth(0.5)
              .stroke()
              .restore();

            // Cell values
            doc.fillColor('#333333');
            columns.forEach((col, i) => {
              let cellValue = row[col];
              if (cellValue instanceof Date) {
                cellValue = cellValue.toLocaleDateString('pl-PL');
              } else if (cellValue == null) {
                cellValue = '';
              } else {
                cellValue = String(cellValue);
              }

              doc.text(
                cellValue,
                doc.page.margins.left + i * colWidth + 3,
                currentY + 5,
                { width: colWidth - 6, height: rowHeight - 4, ellipsis: true },
              );
            });

            currentY += rowHeight;
          });

          // Summary line
          doc.y = currentY + 10;
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor('#666666')
            .text(`Liczba rekordow: ${data.length}`, { align: 'right' });
          doc.moveDown(0.5);
        }

        // Footer with RODO/GDPR compliance note
        this.drawPdfFooter(doc, pageWidth);

        doc.end();

        writeStream.on('finish', () => {
          this.logger.log(`PDF export completed: ${filePath}`);
          resolve(filePath);
        });

        writeStream.on('error', (err) => {
          this.logger.error(`Error writing PDF file: ${err.message}`);
          reject(err);
        });
      });
    } catch (error) {
      this.logger.error(`Error exporting to PDF: ${error.message}`, error.stack);
      throw error;
    }
  }

  private drawPdfFooter(doc: PDFKit.PDFDocument, pageWidth: number): void {
    const footerY = doc.page.height - doc.page.margins.bottom - 30;

    doc
      .save()
      .moveTo(doc.page.margins.left, footerY)
      .lineTo(doc.page.margins.left + pageWidth, footerY)
      .strokeColor('#CCCCCC')
      .lineWidth(0.5)
      .stroke()
      .restore();

    doc
      .fontSize(7)
      .font('Helvetica')
      .fillColor('#999999')
      .text(
        'Ten raport zostal wygenerowany automatycznie przez system Fiskario. ' +
          'Dane sa zgodne z przepisami RODO/GDPR oraz polskimi przepisami podatkowymi. ' +
          'Retencja danych: 5 lat zgodnie z art. 74 ustawy o rachunkowosci.',
        doc.page.margins.left,
        footerY + 5,
        { width: pageWidth, align: 'center' },
      );
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