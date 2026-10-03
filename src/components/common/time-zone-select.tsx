"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const FALLBACK_ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Australia/Sydney", "UTC"];

function allZones(): string[] {
    try {
        const zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone");
        if (zones?.length) return zones.includes("UTC") ? zones : [...zones, "UTC"];
    } catch {
        // Older browsers: the short list below.
    }
    return FALLBACK_ZONES;
}

// "Asia/Kolkata" -> "Kolkata (Asia) · UTC+05:30"
function describeZone(zone: string) {
    const [region, ...rest] = zone.split("/");
    const city = rest.length ? rest.join(" / ").replaceAll("_", " ") : region;
    let offset = "";
    try {
        offset = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(new Date()).find((part) => part.type === "timeZoneName")?.value ?? "";
    } catch {
        offset = "";
    }
    return { city, region: rest.length ? region : "", offset: offset.replace("GMT", "UTC") || "UTC" };
}

// A searchable list of every time zone the browser knows (UI/UX plan §5.16: it was free text).
export function TimeZoneSelect({ id, value, onChange, invalid, describedBy, disabled }: {
    id?: string;
    value: string;
    onChange: (zone: string) => void;
    invalid?: boolean;
    describedBy?: string;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const zones = useMemo(() => allZones().map((zone) => ({ zone, ...describeZone(zone) })), []);
    const current = zones.find((item) => item.zone === value);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    disabled={disabled}
                    className="w-full justify-between font-normal"
                >
                    <span className="truncate">{current ? `${current.city}${current.region ? ` (${current.region})` : ""} · ${current.offset}` : value || "Choose a time zone"}</span>
                    <ChevronsUpDown className="size-4 opacity-50" aria-hidden />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search city or region…" />
                    <CommandList>
                        <CommandEmpty>No time zone matches.</CommandEmpty>
                        <CommandGroup>
                            {zones.map((item) => (
                                <CommandItem
                                    key={item.zone}
                                    value={`${item.zone} ${item.city} ${item.offset}`}
                                    onSelect={() => { onChange(item.zone); setOpen(false); }}
                                >
                                    <Check className={cn("size-4", item.zone === value ? "opacity-100" : "opacity-0")} aria-hidden />
                                    <span className="min-w-0 flex-1 truncate">{item.city}{item.region ? <span className="text-muted-foreground"> ({item.region})</span> : null}</span>
                                    <span className="text-xs text-muted-foreground">{item.offset}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
