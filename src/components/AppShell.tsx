"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "./layout/Sidebar";
import Header from "./layout/Header";

const STANDALONE_ROUTES = ["/login"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isStandalone = pathname && STANDALONE_ROUTES.includes(pathname);

  /** Sidebar mobile: cerrado por defecto. En desktop (>=md) este estado no aplica:
   *  el sidebar siempre está visible en su flujo normal. */
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  /** Cerrar el sidebar mobile automáticamente al navegar entre pantallas. */
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  if (isStandalone) {
    return <>{children}</>;
  }

  return (
    <div id="neura-app-shell" className="flex h-svh min-h-0 overflow-hidden bg-[#F8FAFC]">
      {/* Backdrop solo mobile: aparece cuando el sidebar está abierto en pantallas chicas. */}
      <button
        type="button"
        aria-label="Cerrar menú"
        aria-hidden={!mobileSidebarOpen}
        tabIndex={mobileSidebarOpen ? 0 : -1}
        onClick={() => setMobileSidebarOpen(false)}
        className={`fixed inset-0 z-40 bg-slate-900/55 backdrop-blur-sm transition-opacity duration-200 md:hidden ${
          mobileSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <div id="neura-main-column" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />
        <main id="neura-main-content" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
