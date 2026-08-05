import ModulePlaceholderPage from '@/components/pages/module-placeholder-page';

export default async function Page(props: { params: Promise<{ locale: string }> }) {
  return ModulePlaceholderPage({ ...props, moduleKey: 'changes' });
}
