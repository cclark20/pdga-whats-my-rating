import { Route, Routes } from "react-router";
import Footer from "./components/Footer";
import Masthead from "./components/Masthead";
import Home from "./routes/Home";
import Player from "./routes/Player";

export default function App() {
  return (
    <div className="mx-auto max-w-[1040px] px-4 sm:px-8">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-10 focus:bg-bg focus:px-3 focus:py-2 focus:text-ui"
      >
        Skip to content
      </a>
      <Masthead />
      <main id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/player/:pdgaNo" element={<Player />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
