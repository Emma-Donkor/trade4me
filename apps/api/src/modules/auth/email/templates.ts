export interface VerificationEmail {
  to: string;
  verifyUrl: string;
}

export interface PasswordResetEmail {
  to: string;
  resetUrl: string;
}

interface PreparedEmail {
  subject: string;
  text: string;
  url: string;
}

/** Development fallback: the link is logged instead of sent via SMTP. */
export function verificationTemplate(email: VerificationEmail): PreparedEmail {
  return {
    subject: 'Verify your TradeSense AI account',
    text: `Welcome to TradeSense AI. Verify your email: ${email.verifyUrl}`,
    url: email.verifyUrl,
  };
}

export function passwordResetTemplate(email: PasswordResetEmail): PreparedEmail {
  return {
    subject: 'Reset your TradeSense AI password',
    text: `Use this single-use link to reset your password: ${email.resetUrl}`,
    url: email.resetUrl,
  };
}
