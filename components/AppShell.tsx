"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RefData } from "@/lib/types";
import { formatINR } from "@/lib/format";
import { TransactionForm } from "./TransactionForm";
import {
  IconBucket,
  IconCard,
  IconDashboard,
  IconList,
  IconMenu,
  IconPlus,
  IconSettings,
  IconTag,
  IconTrip,
  IconUpload,
  IconWallet,
  IconX,
} from "./Icons";

const AddCtx = createContext<() => void>(() => {});
/** Lets any screen open the quick-entry form ("Add your first transaction"). */
export const useAddTransaction = () => useContext(AddCtx);

interface Props {
  ref: RefData;
  gated: boolean;
  children: React.ReactNode;
}

export function AppShell({ ref: refData, gated, children }: Props) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [adding, setAdding] = useState(false);

  const openAdd = useCallback(() => setAdding(true), []);

  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  const nav = <SidebarNav ref={refData} pathname={pathname} gated={gated} />;

  return (
    <AddCtx.Provider value={openAdd}>
      {/* ---------------------------------------------- desktop sidebar */}
      <aside
        className="hidden md:flex fixed inset-y-0 left-0 flex-col"
        style={{
          width: "var(--sidebar-w)",
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
          zIndex: 30,
        }}
      >
        <Brand />
        <div className="px-3 pb-3">
          <button className="btn btn-primary w-full" onClick={openAdd}>
            <IconPlus size={16} />
            Add Transaction
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Main">
          {nav}
        </nav>
      </aside>

      {/* ------------------------------------------------- mobile top bar */}
      <header
        className="md:hidden sticky top-0 flex items-center gap-2 px-3 h-14"
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          zIndex: 30,
        }}
      >
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setDrawer(true)}
          aria-label="Open menu"
          aria-expanded={drawer}
        >
          <IconMenu size={20} />
        </button>
        <Link href="/" className="font-semibold text-sm no-underline" style={{ color: "var(--text)" }}>
          Finance
        </Link>
      </header>

      {/* ---------------------------------------------------- mobile drawer */}
      {drawer && (
        <div className="md:hidden fixed inset-0" style={{ zIndex: 60 }}>
          <div
            className="absolute inset-0"
            style={{ background: "rgb(0 0 0 / 0.45)" }}
            onClick={() => setDrawer(false)}
          />
          <aside
            className="absolute inset-y-0 left-0 flex flex-col animate-in"
            style={{
              width: 280,
              maxWidth: "85vw",
              background: "var(--surface)",
              borderRight: "1px solid var(--border)",
            }}
            aria-label="Menu"
          >
            <div className="flex items-center justify-between pr-2">
              <Brand />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
              >
                <IconX size={18} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 pb-6">{nav}</nav>
          </aside>
        </div>
      )}

      {/* ------------------------------------------------------------ main */}
      <main className="md:pl-[var(--sidebar-w)] mobile-pad">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-6 sm:py-6">{children}</div>
      </main>

      {/* ------------------------------------------------ mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 grid grid-cols-5 items-center"
        style={{
          height: 64,
          paddingBottom: "env(safe-area-inset-bottom)",
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          zIndex: 40,
        }}
        aria-label="Primary"
      >
        <BottomLink href="/" label="Home" active={pathname === "/"}>
          <IconDashboard size={20} />
        </BottomLink>
        <BottomLink
          href="/transactions"
          label="Activity"
          active={pathname.startsWith("/transactions")}
        >
          <IconList size={20} />
        </BottomLink>

        <button
          onClick={openAdd}
          className="flex flex-col items-center justify-center"
          aria-label="Add transaction"
        >
          <span
            className="flex items-center justify-center rounded-full"
            style={{
              width: 46,
              height: 46,
              background: "var(--accent)",
              color: "var(--accent-fg)",
              boxShadow: "var(--shadow-lg)",
              marginTop: -14,
            }}
          >
            <IconPlus size={22} />
          </span>
        </button>

        <BottomLink
          href="/accounts"
          label="Accounts"
          active={pathname.startsWith("/accounts") || pathname.startsWith("/cards")}
        >
          <IconWallet size={20} />
        </BottomLink>
        <button
          onClick={() => setDrawer(true)}
          className="flex flex-col items-center justify-center gap-0.5"
          style={{ color: "var(--text-muted)" }}
        >
          <IconMenu size={20} />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      <TransactionForm open={adding} onClose={() => setAdding(false)} ref={refData} />
    </AddCtx.Provider>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-4 h-16">
      <span
        className="flex items-center justify-center rounded-lg font-bold"
        style={{ width: 30, height: 30, background: "var(--accent)", color: "var(--accent-fg)", fontSize: 13 }}
        aria-hidden="true"
      >
        ₹
      </span>
      <span className="font-semibold text-[15px] tracking-tight">Finance</span>
    </div>
  );
}

function BottomLink({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-0.5 no-underline"
      style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
      aria-current={active ? "page" : undefined}
    >
      {children}
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );
}

// ------------------------------------------------------------------ nav

function SidebarNav({
  ref: refData,
  pathname,
  gated,
}: {
  ref: RefData;
  pathname: string;
  gated: boolean;
}) {
  return (
    <div className="space-y-4 pt-1">
      <Group>
        <NavItem href="/" icon={<IconDashboard size={17} />} active={pathname === "/"}>
          Dashboard
        </NavItem>
        <NavItem
          href="/transactions"
          icon={<IconList size={17} />}
          active={pathname.startsWith("/transactions")}
        >
          Transactions
        </NavItem>
      </Group>

      <Section title="Accounts" href="/accounts">
        {refData.accounts.filter((a) => a.is_active).map((a) => (
          <NavItem
            key={a.id}
            href={`/accounts/${a.id}`}
            icon={<IconWallet size={16} />}
            active={pathname === `/accounts/${a.id}`}
            trailing={formatINR(a.current_balance)}
          >
            {a.name}
          </NavItem>
        ))}
        {refData.accounts.filter((a) => a.is_active).length === 0 && <Empty>No accounts</Empty>}
      </Section>

      <Section title="Cards" href="/accounts">
        {refData.cards.filter((c) => c.is_active).map((c) => (
          <NavItem
            key={c.id}
            href={`/cards/${c.id}`}
            icon={<IconCard size={16} />}
            active={pathname === `/cards/${c.id}`}
            trailing={formatINR(c.current_outstanding)}
            trailingTone={c.current_outstanding > 0 ? "expense" : undefined}
          >
            {c.name}
          </NavItem>
        ))}
        {refData.cards.filter((c) => c.is_active).length === 0 && <Empty>No cards</Empty>}
      </Section>

      <Section title="Buckets" href="/buckets">
        {refData.buckets.map((b) => (
          <NavItem
            key={b.id}
            href={`/?bucket=${b.id}`}
            icon={<IconBucket size={16} />}
            active={false}
          >
            {b.name}
          </NavItem>
        ))}
      </Section>

      <Group>
        <NavItem href="/events" icon={<IconTrip size={17} />} active={pathname.startsWith("/events")}>
          Trips &amp; Events
        </NavItem>
        <NavItem href="/import" icon={<IconUpload size={17} />} active={pathname.startsWith("/import")}>
          Import CSV
        </NavItem>
        <NavItem
          href="/settings/categories"
          icon={<IconTag size={17} />}
          active={pathname.startsWith("/settings/categories")}
        >
          Categories
        </NavItem>
        <NavItem
          href="/settings"
          icon={<IconSettings size={17} />}
          active={pathname === "/settings"}
        >
          Settings
        </NavItem>
      </Group>

      {!gated && (
        <div className="px-3 pt-2">
          <p
            className="text-[11px] leading-snug px-2.5 py-2 rounded-md"
            style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
          >
            No password set. Add <code>APP_PASSWORD</code> before deploying.
          </p>
        </div>
      )}
    </div>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="space-y-0.5">{children}</div>;
}

function Section({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-3 mb-1">
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: "var(--text-subtle)" }}
        >
          {title}
        </span>
        <Link
          href={href}
          className="text-[10px] font-semibold no-underline"
          style={{ color: "var(--text-subtle)" }}
        >
          Manage
        </Link>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-1.5 text-xs" style={{ color: "var(--text-subtle)" }}>
      {children}
    </p>
  );
}

function NavItem({
  href,
  icon,
  active,
  children,
  trailing,
  trailingTone,
}: {
  href: string;
  icon: React.ReactNode;
  active: boolean;
  children: React.ReactNode;
  trailing?: string;
  trailingTone?: "expense";
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-3 h-9 rounded-lg no-underline transition-colors"
      style={{
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-muted)",
        fontWeight: active ? 600 : 500,
        fontSize: 13,
      }}
      aria-current={active ? "page" : undefined}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--surface-hover)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ flexShrink: 0, opacity: active ? 1 : 0.75 }}>{icon}</span>
      <span className="truncate flex-1">{children}</span>
      {trailing && (
        <span
          className="text-[11px] tnum"
          style={{
            color: trailingTone === "expense" ? "var(--expense)" : "var(--text-subtle)",
            flexShrink: 0,
          }}
        >
          {trailing}
        </span>
      )}
    </Link>
  );
}
