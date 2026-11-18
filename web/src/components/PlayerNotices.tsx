import type { PlayerResponse } from "@wmr/shared";
import type { ReactNode } from "react";
import { mailto } from "../lib/contact";
import { formatDate } from "../lib/format";
import Notice from "./Notice";

/** Notices that qualify the hero numbers; rendered right below them. */
export default function PlayerNotices({ data }: { data: PlayerResponse }) {
  const { player, official } = data;
  const notices: ReactNode[] = [];

  if (player.membership && !player.membership.current) {
    notices.push(
      `Membership expired ${formatDate(player.membership.expDate)}, so PDGA shows no official rating. The projection still uses your round history.`,
    );
  }

  // our recalculation of the current official rating should match PDGA's
  const calc = official?.rating;
  if (
    calc != null &&
    player.officialRating !== null &&
    // small gaps are routine and explained in "How it's calculated"
    Math.abs(calc - player.officialRating) > 2
  ) {
    const diff = Math.abs(calc - player.officialRating);
    const link = mailto(
      `What's My Rating - Rating Discrepancy (PDGA #${player.pdgaNo})`,
      `PDGA Number: ${player.pdgaNo}\nCalculated Rating: ${calc}\nOfficial Rating: ${player.officialRating}\nDifference: ${diff}\nRounds Evaluated: ${official?.nEvaluated}\nRounds Used: ${official?.nUsed}\n`,
    );
    notices.push(
      <>
        Our recalculation of your official rating comes out {diff} off from PDGA's.{" "}
        That's more than usual. The projection corrects for it, but the round breakdown
        below may not match PDGA's.
        {link && (
          <>
            {" "}
            <a
              href={link}
              className="text-text underline decoration-muted underline-offset-[3px]"
            >
              Report it
            </a>{" "}
            so the calculation can improve.
          </>
        )}
      </>,
    );
  }

  if (notices.length === 0) return null;
  return (
    <div className="-mt-6 space-y-2 pb-12">
      {notices.map((n, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static list built each render
        <Notice key={i}>{n}</Notice>
      ))}
    </div>
  );
}
