// lib/email.ts
// Postmark removed - no email sending

export const runtime = 'nodejs';

export async function sendAdminPurchaseNotice(subject: string, html: string) {
  console.log('EMAIL WOULD BE SENT (Postmark removed):');
  console.log('Subject:', subject);
  console.log('HTML body:', html.substring(0, 200) + '...'); // truncate for logs
  console.log('To: admin (disabled)');

  // Return dummy success for compatibility
  return { MessageID: 'dummy-id', ErrorCode: 0, Message: 'Email disabled - logged only' };
}
