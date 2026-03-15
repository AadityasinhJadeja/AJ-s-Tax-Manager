import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell mode-gateway">
      <section className="hero">
        <p className="eyebrow">AJ Finance Manager</p>
        <h1>Pick the calculator that matches how you get paid</h1>
        <p className="subtitle">
          Start with hourly or salary and move into a cleaner planning workspace built for comparing real
          take-home outcomes.
        </p>
      </section>

      <section className="mode-grid">
        <Link href="/hourly" className="mode-card">
          <h2>Hourly pay</h2>
          <p>For contracts, campus jobs, and flexible work where dates, weeks, and hours all matter.</p>
          <span>Open hourly planner</span>
        </Link>

        <Link href="/salary" className="mode-card">
          <h2>Salary pay</h2>
          <p>For full-time offers and annual compensation planning with quick monthly and yearly take-home views.</p>
          <span>Open salary planner</span>
        </Link>
      </section>
    </main>
  );
}
