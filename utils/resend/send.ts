import { resend, DEFAULT_FROM } from "./client";

type SendEmailArgs = {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
};

export async function sendEmail({ to, subject, html, from = DEFAULT_FROM }: SendEmailArgs) {
  const { data, error } = await resend.emails.send({ from, to, subject, html });

  if (error) {
    throw error;
  }

  return data;
}
