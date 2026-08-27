export function postOnboardingPath(siteSlug: string, synthetic: boolean): string {
  return synthetic
    ? "/sites?onboarded=synthetic"
    : `/sites/${encodeURIComponent(siteSlug)}`;
}
