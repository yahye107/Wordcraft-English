import Link from "next/link";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="reading">
      <h1>We could not find that page</h1>
      <p className="lede">The address may be wrong, or the expression may have been removed.</p>
      <p>
        <Link href="/explore">Browse all expressions</Link> or <Link href="/search">search by meaning</Link>.
      </p>
    </div>
  );
}
