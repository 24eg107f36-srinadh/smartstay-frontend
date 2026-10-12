
import { useNavigate } from "react-router-dom";

export default function TenantDashboard() {
  const navigate = useNavigate();
  const email = localStorage.getItem("smartstay_email") || "Tenant";

  function logout() {
    localStorage.removeItem("smartstay_token");
    localStorage.removeItem("smartstay_role");
    localStorage.removeItem("smartstay_email");
    navigate("/login");
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div className="brand"><span className="brand-icon">S</span> SmartStay</div>
        <button className="secondary-button logout-button" onClick={logout}>Sign Out</button>
      </header>

      <section className="dashboard-content">
        <span className="kicker">TENANT PORTAL</span>
        <h1>Welcome to SmartStay</h1>
        <p className="muted">Signed in as {email}</p>

        <div className="dashboard-grid">
          <article className="dashboard-tile">
            <span className="tile-icon">⌂</span>
            <h3>Find a Hostel</h3>
            <p>Explore available accommodation.</p>
            <span className="coming-soon">Coming soon</span>
          </article>
          <article className="dashboard-tile">
            <span className="tile-icon">▤</span>
            <h3>My Bookings</h3>
            <p>View your hostel bookings.</p>
            <span className="coming-soon">Coming soon</span>
          </article>
          <article className="dashboard-tile">
            <span className="tile-icon">♡</span>
            <h3>My Profile</h3>
            <p>Manage your account details.</p>
            <span className="coming-soon">Coming soon</span>
          </article>
        </div>
      </section>
    </main>
  );
}