// Owner-provided social channels (26 October 2026), each checked to open the Unnati Vidya profile.
// One list feeds the footer, About page, author page, articles and the Organization sameAs data;
// add or remove a channel here only.
export const SOCIAL_CHANNELS = [
  { id: "youtube", label: "YouTube", url: "https://www.youtube.com/@Unnati_Vidya" },
  { id: "instagram", label: "Instagram", url: "https://www.instagram.com/unnati_vidya" },
  { id: "facebook", label: "Facebook", url: "https://www.facebook.com/unnatividya" },
] as const;

export const SOCIAL_URLS: string[] = SOCIAL_CHANNELS.map(channel => channel.url);
