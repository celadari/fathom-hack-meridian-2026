import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./styles/global.css";
import "./styles/explainer.css";
import { Auction } from "./screens/Auction";
import { Close } from "./screens/Close";
import { HowItWorks } from "./screens/HowItWorks";
import { Liquidity } from "./screens/Liquidity";
import { Replay } from "./screens/Replay";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Auction />} />
        <Route path="/close" element={<Close />} />
        <Route path="/liquidity" element={<Liquidity />} />
        <Route path="/replay" element={<Replay />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
