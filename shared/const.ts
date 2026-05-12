export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
// Admin sessions are 8 hours sliding (production-readiness baseline). Shorter
// than main app's 30-day session by design: admins can do more damage if a
// laptop is left unattended, so we force re-auth more often.
export const ADMIN_SESSION_MS = 1000 * 60 * 60 * 8;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
