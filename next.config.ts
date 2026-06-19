import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El VPS de Coolify mata el container durante "Running TypeScript ..." por
  // OOM (RAM acotada). El chequeo de tipos sigue siendo obligatorio en local
  // y en CI vía `tsc --noEmit` antes de pushear. En el build de producción
  // se saltea para que el deploy no truene por presión de memoria.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Next.js 16 limita el body de las requests a 10 MB por defecto. El módulo
  // de reseñas acepta videos de hasta 200 MB (MP4/WebM/MOV), por lo que hay
  // que subir este tope. El nombre `middlewareClientMaxBodySize` es engañoso:
  // según la doc de Next 16 (link emitido en el warning cuando se excede),
  // este flag controla el límite global para route handlers y middleware.
  experimental: {
    proxyClientMaxBodySize: "250mb",
  },
  // Redirects 308 a nivel framework. Útil para mover rutas viejas a las
  // nuevas convenciones sin romper links externos.
  async redirects() {
    return [
      {
        // Ruta vieja → nueva convención corta `/privacidad`.
        source: "/politica-privacidad",
        destination: "/privacidad",
        permanent: true,
      },
    ];
  },
  images: {
    // Dominios externos permitidos para next/image.
    // Sin esto el optimizador devuelve 400 a cualquier URL externa,
    // bloqueando las imágenes del bucket público de Supabase Storage.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.neura.com.py",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
