import "server-only";

export function getApprovedLegalVersions() {
  const termsVersion = process.env.TERMS_VERSION;
  const privacyVersion = process.env.PRIVACY_VERSION;
  if (process.env.LEGAL_DOCUMENTS_APPROVED !== "true"
    || !termsVersion || !privacyVersion
    || termsVersion.toLowerCase().startsWith("draft")
    || privacyVersion.toLowerCase().startsWith("draft")) return null;
  return { termsVersion, privacyVersion };
}
