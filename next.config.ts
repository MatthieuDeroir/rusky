import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/driver packages must not be bundled by the server compiler.
  serverExternalPackages: ["@libsql/client", "@prisma/client", "@prisma/adapter-libsql"],
};

export default nextConfig;
