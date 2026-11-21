import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEV_LINK_FILES = [
  resolve(process.cwd(), 'apps/api/.auth-dev-links.log'),
  resolve(process.cwd(), '.auth-dev-links.log'),
];

async function devLinkFor(email: string): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    for (const file of DEV_LINK_FILES) {
      try {
        const lines = (await readFile(file, 'utf8')).trim().split('\n').filter(Boolean);
        for (const line of lines.reverse()) {
          const entry = JSON.parse(line) as { email?: string; link?: string };
          if (entry.email === email && entry.link?.includes('/verify-email?token=')) {
            return entry.link;
          }
        }
      } catch {
        // The API creates the sink on the first dev email.
      }
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`No verification link was written for ${email}`);
}

test('register → verify → login → dashboard → logout', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'E2E-Pass-123';

  await page.goto('/register');
  await page.getByLabel(/Name/).fill('E2E User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();

  const verifyLink = await devLinkFor(email);
  await page.goto(verifyLink);
  await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('signed-in-as')).toContainText(email);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
});
