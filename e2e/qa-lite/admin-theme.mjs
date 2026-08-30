const themeRevision = new WeakMap();

export async function navigateToAdminWithTheme(page, theme) {
  const revision = (themeRevision.get(page) || 0) + 1;
  themeRevision.set(page, revision);

  await page.addInitScript(({ theme: nextTheme, revision: nextRevision }) => {
    const revisionKey = 'dico-qa-lite-admin-theme-revision';
    const currentRevision = Number(sessionStorage.getItem(revisionKey) || '-1');
    if (nextRevision < currentRevision) return;
    localStorage.setItem('ag-theme', nextTheme);
    sessionStorage.setItem(revisionKey, String(nextRevision));
  }, { theme, revision });

  await page.goto('/admin');
}
