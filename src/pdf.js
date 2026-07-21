import { jsPDF } from 'jspdf';
import { WAIVER_TEXT } from './waiver-text.js';

// Mirrors the app's dark header + red accent theme (src/style.css --bg / --accent).
const COLORS = {
  headerBg: [20, 22, 26],
  accent: [214, 40, 40],
  muted: [110, 110, 110],
  text: [34, 34, 34],
  border: [221, 221, 221],
};

export function generateWaiverPdf(waiver) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  const headerHeight = 70;
  let y = 0;

  function drawHeader() {
    doc.setFillColor(...COLORS.headerBg);
    doc.rect(0, 0, pageWidth, headerHeight, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('The Jones Gym', margin, 34);
    doc.setTextColor(...COLORS.accent);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Liability Waiver', margin, 52);
    y = headerHeight + 22;
  }

  function drawContinuationHeader() {
    doc.setDrawColor(...COLORS.accent);
    doc.setLineWidth(2);
    doc.line(0, 0, pageWidth, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text('The Jones Gym - Liability Waiver (continued)', margin, 24);
    y = 48;
  }

  function addPageIfNeeded(neededHeight) {
    if (y + neededHeight > pageHeight - margin) {
      doc.addPage();
      drawContinuationHeader();
    }
  }

  function sectionHeading(label) {
    addPageIfNeeded(24);
    doc.setTextColor(...COLORS.accent);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(label.toUpperCase(), margin, y);
    y += 16;
  }

  // Shrinks font/line-height as needed so the waiver text keeps fitting in
  // the space available on page 1 as clauses are added over time.
  const TEXT_SIZE_STEPS = [
    { fontSize: 9, lineHeight: 11, blankHeight: 6 },
    { fontSize: 9, lineHeight: 10, blankHeight: 5 },
    { fontSize: 8.5, lineHeight: 9.5, blankHeight: 5 },
    { fontSize: 8, lineHeight: 9, blankHeight: 4 },
    { fontSize: 7.5, lineHeight: 8.5, blankHeight: 4 },
  ];

  function fitWaiverText(text, availableHeight) {
    let chosen = TEXT_SIZE_STEPS[TEXT_SIZE_STEPS.length - 1];
    for (const step of TEXT_SIZE_STEPS) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(step.fontSize);
      const lines = doc.splitTextToSize(text, maxWidth);
      const blank = lines.filter((l) => l.trim() === '').length;
      const height = (lines.length - blank) * step.lineHeight + blank * step.blankHeight;
      if (height <= availableHeight) return { lines, ...step };
      chosen = step;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(chosen.fontSize);
    return { lines: doc.splitTextToSize(text, maxWidth), ...chosen };
  }

  drawHeader();

  sectionHeading('Participant Information');
  const infoLeft = [
    ['Name', waiver.fullName],
    ['Date of Birth', waiver.dob],
    ['Phone', waiver.phone],
    ['Address', waiver.address],
  ];
  const infoRight = [
    ['City/State/Zip', `${waiver.city}, ${waiver.state} ${waiver.zip}`],
    ['Emergency Contact', `${waiver.emergencyName} (${waiver.emergencyPhone})`],
    ['Relation', waiver.emergencyRelation],
    ['Signed', new Date(waiver.timestamp || Date.now()).toLocaleString()],
  ];
  const rowHeight = 18;
  const boxTop = y;
  const boxHeight = infoLeft.length * rowHeight + 16;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(1);
  doc.roundedRect(margin, boxTop, maxWidth, boxHeight, 4, 4);

  const drawInfoColumn = (rows, colX) => {
    let rowY = boxTop + 20;
    rows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.muted);
      doc.text(label, colX, rowY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.text);
      doc.text(String(value ?? ''), colX + 92, rowY);
      rowY += rowHeight;
    });
  };
  drawInfoColumn(infoLeft, margin + 14);
  drawInfoColumn(infoRight, margin + maxWidth / 2 + 14);

  y = boxTop + boxHeight + 16;

  sectionHeading('Waiver Terms');
  const trailingReserved = 10 + 16 + (waiver.guardianName ? 11 : 0) + 66;
  const availableForText = pageHeight - margin - y - trailingReserved;
  const { lines: textLines, fontSize: textFontSize, lineHeight, blankHeight } = fitWaiverText(WAIVER_TEXT, availableForText);
  textLines.forEach((line) => {
    const isBlank = line.trim() === '';
    const lh = isBlank ? blankHeight : lineHeight;
    addPageIfNeeded(lh);
    if (!isBlank) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(textFontSize);
      doc.setTextColor(...COLORS.text);
      doc.text(line, margin, y);
    }
    y += lh;
  });

  y += 10;
  sectionHeading('Signature');
  if (waiver.guardianName) {
    addPageIfNeeded(11);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.muted);
    doc.text(`Signed by parent/guardian on behalf of minor participant: ${waiver.guardianName}`, margin, y);
    y += 11;
  }
  const sigBoxHeight = 66;
  addPageIfNeeded(sigBoxHeight);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...COLORS.border);
  doc.roundedRect(margin, y, 190, sigBoxHeight, 4, 4, 'FD');
  doc.addImage(waiver.signatureDataUrl, 'PNG', margin + 8, y + 7, 174, 52, undefined, 'FAST');
  y += sigBoxHeight;

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...COLORS.accent);
    doc.setLineWidth(1.5);
    doc.line(margin, pageHeight - 36, pageWidth - margin, pageHeight - 36);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text('The Jones Gym LLC', margin, pageHeight - 22);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 22, { align: 'right' });
  }

  return doc;
}

export function waiverPdfFilename(waiver) {
  const safeName = (waiver.fullName || 'waiver').trim().replace(/[^a-z0-9]+/gi, '-');
  const date = new Date(waiver.timestamp || Date.now()).toISOString().slice(0, 10);
  return `jonesgym-waiver-${safeName}-${date}.pdf`;
}
