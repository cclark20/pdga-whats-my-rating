import { Navigate, useSearchParams } from "react-router";
import Lookup from "../components/Lookup";

export default function Home() {
  const [params] = useSearchParams();
  // keep old Streamlit bookmarks (/?pdga_no=123) working
  const legacy = params.get("pdga_no");
  if (legacy && /^\d+$/.test(legacy))
    return <Navigate to={`/player/${legacy}`} replace />;

  return (
    <>
      <Lookup />
      <section className="max-w-[65ch] py-12 text-body text-muted">
        <p>
          See how your official PDGA rating is calculated, which rounds count and which
          are dropped, and what your rating is projected to be at the next update,
          including events that haven't been rated yet.
        </p>
        <p className="mt-4">Bookmark your player page to come back to it.</p>
      </section>
    </>
  );
}
