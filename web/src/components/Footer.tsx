import { mailto } from "../lib/contact";

export default function Footer() {
  const feedback = mailto("What's My Rating - Feedback");
  return (
    <footer className="mt-24 flex flex-col gap-2 border-t border-rule py-6 sm:items-center text-ui text-muted sm:flex-row sm:justify-between">
      <p>
        PDGA Authorized Developer. Player and event data provided by{" "}
        <a
          href="https://www.pdga.com"
          className="text-text underline decoration-muted underline-offset-[3px]"
        >
          PDGA
        </a>
        . Not an official PDGA rating.
      </p>
      <p className="flex gap-6">
        {feedback && (
          <a
            href={feedback}
            className="inline-flex min-h-11 items-center underline decoration-muted underline-offset-[3px]"
          >
            Send feedback
          </a>
        )}
        <a
          href="https://buymeacoffee.com/cclark"
          className="inline-flex min-h-11 items-center underline decoration-muted underline-offset-[3px]"
        >
          Buy me a coffee
        </a>
      </p>
    </footer>
  );
}
