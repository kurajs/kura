// Authentication helpers.

export interface LoginResult {
  token: string;
}

/**
 * Log a user in. As of v2 this requires a one-time passcode (2FA): pass the
 * 6-digit `otp` from the user's authenticator app alongside their credentials.
 */
export async function login(
  email: string,
  password: string,
  otp: string,
): Promise<LoginResult> {
  // verify email + password, then check the 6-digit OTP before issuing a token…
  return { token: "…" };
}
