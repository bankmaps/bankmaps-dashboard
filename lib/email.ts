import { ServerClient } from 'postmark';

export const runtime = 'nodejs';

const client = new ServerClient(process.env.POSTMARK_SERVER_TOKEN!);

export async function sendAdminPurchaseNotice(subject: string, html: string) {
  const from = process.env.POSTMARK_FROM!;
  const to = process.env.POSTMARK_TO_ADMIN || from;
  const stream = process.env.POSTMARK_STREAM || 'outbound';

  const res = await client.sendEmail({
    From: from,
    To: to,
    Subject: subject,
    HtmlBody: html,
    MessageStream: stream,
  });

  console.log('Postmark response:', res);
  return res;
}
