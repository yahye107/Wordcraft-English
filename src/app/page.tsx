import Link from "next/link";

export default function Dashboard() {
  return (
    <>
      <h1>From a plain thought to a written sentence</h1>
      <p className="lede">
        Wordcraft teaches you how to say what you mean, with the right words, in your own hand.
      </p>

      <figure className="turn" aria-label="Example of improving a sentence">
        <p className="turn-before">
          <span className="wrong">She was angry.</span>
        </p>
        <p className="turn-after">
          Her <span className="hl">jaw tightened</span>, and she set the cup down a little too hard.
        </p>
        <figcaption className="turn-note">
          Show the feeling through the body. Find the expression in Explore, then write your own.
        </figcaption>
      </figure>

      <div className="tiles">
        <Link href="/explore" className="tile">
          <h3>Explore expressions</h3>
          <p>Browse by feeling, action or situation, and see how near-synonyms differ.</p>
        </Link>
        <Link href="/search" className="tile">
          <h3>Search by what you mean</h3>
          <p>Try “ways to show disappointment without saying disappointed”.</p>
        </Link>
        <Link href="/labs" className="tile">
          <h3>Labs</h3>
          <p>Dialogue and sentence construction, with exercises. Coming soon.</p>
        </Link>
      </div>
    </>
  );
}
