import { generateWaiverPdf, waiverPdfFilename } from './pdf.js';

const WORKER_URL = 'https://jones-gym-waiver-email.zachgreenlief.workers.dev';

export async function sendWaiverNotification(waiver) {
  const pdfBase64 = generateWaiverPdf(waiver).output('datauristring').split(',')[1];

  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...waiver,
      pdfBase64,
      pdfFilename: waiverPdfFilename(waiver),
    }),
  });

  if (!res.ok) {
    throw new Error(`Email notification failed with status ${res.status}`);
  }
}
