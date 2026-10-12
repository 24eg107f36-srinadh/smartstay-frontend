
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    role: "TENANT",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const email = form.email.trim().toLowerCase();

    try {
      const response = await fetch("http://localhost:8080/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email,
          phone: form.phone.trim(),
          password: form.password,
          role: form.role,
        }),
      });

      const message = await response.text();
      if (!response.ok) {
        setError(message || "Registration failed. Please check your details.");
        return;
      }

      const otpResponse = await fetch(
        `http://localhost:8080/api/auth/send-otp?email=${encodeURIComponent(email)}`,
        { method: "POST" }
      );

      if (!otpResponse.ok) {
        const otpMessage = await otpResponse.text();
        setError(
          "Your account may have been created, but the OTP could not be sent. " +
          (otpMessage || "Please try sending the OTP again.")
        );
        return;
      }

      navigate(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch {
      setError("Cannot connect to the backend on port 8080.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="simple-page">
      <form className="auth-card wide-card" onSubmit={handleSubmit}>
        <Link className="brand" to="/login">
          <span className="brand-icon">S</span> SmartStay
        </Link>
        <span className="kicker">GET STARTED</span>
        <h2>Create your account</h2>
        <p className="muted">Join SmartStay as a tenant or hostel owner.</p>

        {error && <div className="error-message" role="alert">{error}</div>}

        <label htmlFor="name">Full name</label>
        <input id="name" name="name" value={form.name} onChange={update} placeholder="Your full name" required />

        <label htmlFor="register-email">Email address</label>
        <input id="register-email" name="email" type="email" value={form.email} onChange={update} placeholder="you@example.com" required />

        <label htmlFor="phone">Phone number</label>
        <input id="phone" name="phone" type="tel" value={form.phone} onChange={update} placeholder="Your phone number" required />

        <label htmlFor="role">I want to register as</label>
        <select id="role" name="role" value={form.role} onChange={update}>
          <option value="TENANT">Tenant</option>
          <option value="OWNER">Hostel Owner</option>
        </select>

        <label htmlFor="register-password">Password</label>
        <input id="register-password" name="password" type="password" autoComplete="new-password" value={form.password} onChange={update} minLength={8} placeholder="At least 8 characters" required />

        <label htmlFor="confirmPassword">Confirm password</label>
        <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={update} minLength={8} placeholder="Enter your password again" required />

        <button className="primary-button" disabled={loading}>
          {loading ? "Creating account..." : "Create Account"} {!loading && <span>→</span>}
        </button>

        <p className="center-text">Already have an account? <Link to="/login">Sign in</Link></p>
      </form>
    </main>
  );
}