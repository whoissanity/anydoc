import { PDFDocument, rgb, degrees } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

async function generateArabicPdf() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);

  const arabicText = 'مرحبا بالعالم'; // "Hello World" in Arabic
  const fontSize = 36;
  const x = 500; // place near right edge to test right alignment
  const y = 400;

  // Use raster drawing path (needsRasterText will be true for Arabic)
  const session = {
    text: arabicText,
    x,
    y,
    width: 200,
    height: 50,
    fontSize,
    fontFamily: 'sans-serif',
    color: '#000000',
    lineHeight: 1.2,
    bold: false,
    underline: false,
    strikethrough: false,
    rotation: 0,
    pageIndex: 0,
  } as any;

  // Import the raster function directly (avoid circular deps)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { drawRasterTextBox } = require('../src/lib/edit/edit-engine');
  await drawRasterTextBox(pdfDoc, 0, session);

  const pdfBytes = await pdfDoc.save();
  const outPath = path.resolve('test/fixtures/arabic.pdf');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, pdfBytes);
  console.log('Arabic PDF fixture written to', outPath);
}

generateArabicPdf().catch(console.error);
