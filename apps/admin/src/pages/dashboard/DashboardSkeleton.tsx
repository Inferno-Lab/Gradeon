import { PageScope } from '@tangent/web-ui';
import './dashboard.css';

/** The page's own shape in grey, shown while the first numbers load. */
export function DashboardSkeleton() {
  const block = (cls: string, h: number) => <div className={`${cls} skc`} style={{ minHeight: h, borderRadius: 24 }} />;
  return (
    <PageScope page="dashboard">
      <main className="mn" aria-busy="true" aria-label="Loading the dashboard">
        <header className="hd"><div><h1>Dashboard</h1><p>&nbsp;</p></div></header>
        <section className="grid">{block('s3', 232)}{block('s3', 232)}{block('s3', 232)}{block('s3', 232)}</section>
        <section className="grid">{block('s8', 470)}{block('s4', 470)}</section>
        <section className="grid">{block('s6', 300)}{block('s6', 300)}</section>
      </main>
    </PageScope>
  );
}
