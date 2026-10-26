import { Facebook, Instagram, Youtube } from "lucide-react";
import { SOCIAL_CHANNELS } from "@/lib/social";

const ICONS = { youtube: Youtube, instagram: Instagram, facebook: Facebook };

// Plain links to Unnati Vidya's social profiles: no embeds or tracking scripts. "icons" is the
// compact footer row; "labelled" shows each channel's name for the About, author and article pages.
export function SocialLinks({ variant = "icons", className }: { variant?: "icons" | "labelled"; className?: string }) {
  return <ul className={`uv-social is-${variant}${className ? ` ${className}` : ""}`} aria-label="Unnati Vidya on social media">
    {SOCIAL_CHANNELS.map(channel => {
      const Icon = ICONS[channel.id];
      return <li key={channel.id}>
        <a href={channel.url} target="_blank" rel="noopener noreferrer me" aria-label={variant === "icons" ? `Unnati Vidya on ${channel.label} (opens in a new tab)` : undefined}>
          <Icon size={variant === "icons" ? 20 : 18} aria-hidden="true" />
          {variant === "labelled" ? <>{channel.label}<span className="sr-only"> (opens in a new tab)</span></> : null}
        </a>
      </li>;
    })}
  </ul>;
}
