import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container" style={{ padding: "3rem 0", textAlign: "center" }}>
      <h1 style={{ marginBottom: 8 }}>Not found</h1>
      <p className="muted">That page doesn’t exist on Hellcore Forums.</p>
      <Link href="/" className="btn" style={{ marginTop: 16 }}>Back home</Link>
    </div>
  );
}
