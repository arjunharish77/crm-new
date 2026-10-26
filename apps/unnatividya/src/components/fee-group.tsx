"use client";

import { useSyncExternalStore } from "react";
import type { CategoryFees } from "@/data/catalog";
import { FEE_GROUP_STORAGE_KEY, FEE_GROUPS, feeForGroup, formatGroupAmount, groupFromTimeZone, isFeeGroup, UNPUBLISHED_INTERNATIONAL, type FeeGroup } from "@/lib/fee-group";

// Wave 5 E2: one shared store for the visitor's fee group. The server snapshot is always "indian",
// so server HTML and the first client render match; after hydration React re-reads the browser
// snapshot (a saved choice, else the time zone). Storage can be unavailable; that never breaks a page.
const listeners = new Set<() => void>();
let chosen: FeeGroup | null = null;

function read(): FeeGroup {
  if (chosen) return chosen;
  try { const saved = window.localStorage.getItem(FEE_GROUP_STORAGE_KEY); if (isFeeGroup(saved)) return saved; } catch { /* private mode */ }
  try { return groupFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { return "indian"; }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === FEE_GROUP_STORAGE_KEY) { chosen = null; listener(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}
export function setFeeGroup(group: FeeGroup) {
  chosen = group;
  try { window.localStorage.setItem(FEE_GROUP_STORAGE_KEY, group); } catch { /* the choice still applies to this page */ }
  listeners.forEach(listener => listener());
}
export function useFeeGroup(): FeeGroup {
  return useSyncExternalStore(subscribe, read, () => "indian");
}
function useDetected(): boolean {
  return useSyncExternalStore(subscribe, () => { if (chosen) return false; try { return !isFeeGroup(window.localStorage.getItem(FEE_GROUP_STORAGE_KEY)); } catch { return true; } }, () => true);
}

// "Showing fees for" switch, placed near fee information.
export function FeeGroupSwitch({ id = "fee-group", className = "" }: { id?: string; className?: string }) {
  const group = useFeeGroup();
  const detected = useDetected();
  return <div className={`uv-fee-group ${className}`}>
    <label htmlFor={id}>Showing fees for</label>
    <select id={id} value={group} onChange={event => { if (isFeeGroup(event.target.value)) setFeeGroup(event.target.value); }}>
      {FEE_GROUPS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    {detected ? <small>Set from your device&apos;s time zone; change it if it doesn&apos;t fit you.</small> : null}
  </div>;
}

// A course's fee for the visitor's group. "short" is for cards; "unpublished" text is spelled out.
export function GroupFeeText({ fee, categoryFees, variant = "total", short = false }: { fee: number; categoryFees?: CategoryFees; variant?: "total" | "semester"; short?: boolean }) {
  const group = useFeeGroup();
  const result = feeForGroup({ fee, categoryFees }, group);
  if (result.kind === "unpublished") return <span className="uv-fee-unpublished">{short ? "Ask for the international fee" : UNPUBLISHED_INTERNATIONAL}</span>;
  if (variant === "semester") return result.perSemester && result.semesters ? <>{formatGroupAmount(result.currency, result.perSemester)} × {result.semesters}</> : <span className="uv-fee-unpublished">Not published</span>;
  return <>{formatGroupAmount(result.currency, result.total)}</>;
}

// Which group a fee shown in a card or table belongs to, for screen readers and small captions.
export function GroupFeeLabel() {
  const group = useFeeGroup();
  return <>{FEE_GROUPS.find(item => item.id === group)?.label}</>;
}

// EMI is Indian lending in rupees, so it shows only for the Indian group.
export function GroupEmiText({ emi }: { emi: string }) {
  const group = useFeeGroup();
  return group === "indian" ? <>{emi}</> : <span className="uv-fee-unpublished">Indian applicants only</span>;
}

// "No-cost EMI from …" for Indian applicants only; nothing for other groups.
export function GroupEmiPill({ emi, className }: { emi: string; className?: string }) {
  const group = useFeeGroup();
  return group === "indian" ? <span className={className}>No-cost EMI from {emi}</span> : null;
}

// Shown where a program has no published fee for the visitor's group outside India.
export function InternationalFeeNote({ categoryFees }: { categoryFees?: CategoryFees }) {
  const group = useFeeGroup();
  if (group === "indian" || feeForGroup({ fee: 0, categoryFees }, group).kind !== "unpublished") return null;
  return <p className="uv-fee-note" role="status">{UNPUBLISHED_INTERNATIONAL}. The amounts below are for Indian applicants.</p>;
}

// The payment plans and EMI on a course page are for Indian applicants; say so for other groups.
export function IndianPlansNote() {
  const group = useFeeGroup();
  return group === "indian" ? null : <p className="uv-fee-note">The payment plans below are for Indian applicants. Ask the university how international applicants pay.</p>;
}
