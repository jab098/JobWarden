import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";

const links = [
  { href: "/admin/access", label: "Access" },
  { href: "/admin/sources", label: "Sources" },
  { href: "/admin/ingestion", label: "Ingestion" },
] as const;

function AdminNavigation({
  label,
  preview,
}: {
  label: string;
  preview: boolean;
}) {
  return (
    <nav aria-label={label} className="flex gap-1 lg:block lg:space-y-1">
      {links.map((link) => (
        <Link
          key={link.href}
          href={preview ? `#${link.label.toLowerCase()}` : link.href}
          className="block rounded-md px-3 py-2 text-sm font-medium text-[#384256] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6] lg:px-4"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function AdminShell({
  children,
  preview = false,
}: Readonly<{
  children: React.ReactNode;
  preview?: boolean;
}>) {
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-[#f4f1ea] text-[#172033]">
      {preview ? (
        <p className="sticky top-0 z-40 break-words border-b border-[#b9c9df] bg-[#eaf0f8] px-5 py-2 text-center text-xs font-medium text-[#244873]">
          Read-only fictional administrator preview — no administrator access
          granted
        </p>
      ) : null}
      <header className="border-b border-[#d8d4cb] px-5 py-4 lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <Link
            href={preview ? "/development/admin-preview" : "/admin/access"}
            className="font-semibold tracking-[-0.02em]"
          >
            JobWarden administration
          </Link>
          {!preview ? <SignOutButton /> : null}
        </div>
        <div className="mt-3 overflow-x-auto">
          <AdminNavigation label="Administrator mobile" preview={preview} />
        </div>
      </header>
      <aside className="fixed inset-y-0 left-0 hidden w-56 border-r border-[#d8d4cb] bg-[#f4f1ea] lg:flex lg:flex-col">
        <div className="border-b border-[#d8d4cb] px-6 py-6">
          <Link
            href={preview ? "/development/admin-preview" : "/admin/access"}
            className="font-semibold tracking-[-0.02em]"
          >
            JobWarden
          </Link>
          <p className="mt-1 text-xs text-[#596173]">Private beta operations</p>
        </div>
        <div className="p-3">
          <AdminNavigation label="Administrator primary" preview={preview} />
        </div>
        <div className="mt-auto border-t border-[#d8d4cb] px-6 py-5">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#596173]">
            {preview ? "Fictional preview" : "Administrator"}
          </p>
          {!preview ? (
            <div className="mt-3">
              <SignOutButton />
            </div>
          ) : null}
        </div>
      </aside>
      <div className="w-full min-w-0 max-w-full overflow-x-clip lg:pl-56">
        {children}
      </div>
    </div>
  );
}
