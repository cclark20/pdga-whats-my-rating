const EMAIL: string = import.meta.env.VITE_CONTACT_EMAIL ?? "";

/** A prefilled feedback mailto link, or null when no contact email is configured. */
export function mailto(subject: string, body = ""): string | null {
  if (!EMAIL) return null;
  return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
