// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlayerNotices from "../src/components/PlayerNotices";
import Home from "../src/routes/Home";
import Player from "../src/routes/Player";
import { playerResponse } from "./fixtures";

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/player/:pdgaNo" element={<Player />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

beforeEach(() => {
  // recharts' ResponsiveContainer and the chart's media query need these in jsdom
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("routing", () => {
  it("redirects old Streamlit bookmarks to the player page", () => {
    mockFetch(200, playerResponse());
    renderAt("/?pdga_no=167210");
    expect(screen.getByTestId("path").textContent).toBe("/player/167210");
  });

  it("rejects a non-numeric PDGA number without navigating", async () => {
    renderAt("/");
    await userEvent.type(screen.getByLabelText(/PDGA number/i), "abc");
    await userEvent.click(screen.getByRole("button", { name: "Look up" }));
    expect(screen.getByText(/Enter a PDGA number/)).toBeTruthy();
    expect(screen.getByTestId("path").textContent).toBe("/");
  });

  it("navigates to the player page on lookup", async () => {
    mockFetch(200, playerResponse());
    renderAt("/");
    await userEvent.type(screen.getByLabelText(/PDGA number/i), "#167210");
    await userEvent.click(screen.getByRole("button", { name: "Look up" }));
    expect(screen.getByTestId("path").textContent).toBe("/player/167210");
  });
});

describe("player page", () => {
  it("shows the official and projected ratings", async () => {
    const data = playerResponse();
    mockFetch(200, data);
    renderAt("/player/167210");
    expect(await screen.findByRole("link", { name: /Casey Clark/ })).toBeTruthy();
    expect(
      screen.getAllByText(String(data.player.officialRating)).length,
    ).toBeGreaterThan(0);
    // no new rounds: the projection holds at the official rating
    expect(screen.getByText(/your rating holds at/)).toBeTruthy();
  });

  it("explains an unknown PDGA number", async () => {
    mockFetch(404, { error: "not_found", message: "No PDGA player with that number." });
    renderAt("/player/9");
    expect(await screen.findByText(/No PDGA player #9/)).toBeTruthy();
  });

  it("passes on the server's rate-limit message", async () => {
    mockFetch(503, {
      error: "rate_limited",
      message: "PDGA.com is rate limiting requests.",
    });
    renderAt("/player/9");
    expect(await screen.findByText(/rate limiting/)).toBeTruthy();
  });
});

describe("notices", () => {
  it("flags an expired membership", () => {
    const data = playerResponse({
      membership: { current: false, expDate: "2022-12-31" },
      officialRating: null,
    });
    render(<PlayerNotices data={data} />);
    expect(screen.getByText(/Membership expired Dec 31, 2022/)).toBeTruthy();
  });

  it("flags an unusual gap between our recalculation and official", () => {
    const data = playerResponse();
    data.player.officialRating = (data.official?.rating ?? 0) + 3;
    render(<PlayerNotices data={data} />);
    expect(screen.getByText(/comes out 3 off from PDGA's/)).toBeTruthy();
  });

  it("leaves routine 1-2 point gaps to the methodology section", () => {
    const data = playerResponse();
    data.player.officialRating = (data.official?.rating ?? 0) + 1;
    const { container } = render(<PlayerNotices data={data} />);
    expect(container.textContent).toBe("");
  });

  it("stays quiet when the calculation matches", () => {
    const { container } = render(<PlayerNotices data={playerResponse()} />);
    expect(container.textContent).toBe("");
  });
});
