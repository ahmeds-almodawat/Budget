/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const modules = [
  "budgets",
  "milestones",
  "tasks",
  "cost-control",
  "commitments",
  "actuals",
  "forecasts",
  "changes",
  "risks",
  "reports",
  "approvals",
  "imports",
  "master-data",
  "administration",
  "audit",
];

for (const m of modules) {
  const dir = path.join("src/app/[locale]", m);
  fs.mkdirSync(dir, { recursive: true });
  const content = `import ModulePlaceholderPage from '@/components/pages/module-placeholder-page';

export default async function Page(props: { params: Promise<{ locale: string }> }) {
  return ModulePlaceholderPage({ ...props, moduleKey: '${m}' });
}
`;
  fs.writeFileSync(path.join(dir, "page.tsx"), content);
}

console.log("Created", modules.length, "module pages");
