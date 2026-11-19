import type { NextConfig } from "next";

// Pages read a local SQLite database at request time, so we keep the classic
// dynamic model (no Cache Components) and mark data pages `force-dynamic`.
const nextConfig: NextConfig = {};

export default nextConfig;
