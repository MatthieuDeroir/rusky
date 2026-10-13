import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Toutes les pages lisent des données personnelles (session + base) : pas de Cache Components,
  // chaque page est rendue à la demande avec un squelette (loading.tsx) pendant le chargement.
  cacheComponents: false,
  serverExternalPackages: ["@libsql/client", "@prisma/client", "@prisma/adapter-libsql"],
  allowedDevOrigins: ["127.0.0.1", "192.168.1.*"],
  experimental: {
    // Pages déjà visitées gardées 2 min en mémoire : passer d'un onglet à l'autre est instantané,
    // même sur une connexion lente. Les actions qui changent des données appellent revalidatePath,
    // ce qui vide ce cache.
    staleTimes: { dynamic: 120 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
