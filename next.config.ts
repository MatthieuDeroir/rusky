import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/driver packages must not be bundled by the server compiler.
  serverExternalPackages: ["@libsql/client", "@prisma/client", "@prisma/adapter-libsql"],
  experimental: {
    // Next 15+ defaults dynamic pages to staleTime 0: revisiting a page you just left
    // always refetches from the server. Our server actions already call revalidatePath()
    // on every mutation, which busts this cache immediately when data actually changes —
    // so it's safe to let already-visited pages stay instant in between.
    staleTimes: {
      dynamic: 180,
    },
  },
};

export default nextConfig;
