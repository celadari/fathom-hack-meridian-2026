import "./polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { DataProvider } from "./data/useFathom";
import { DemoBar } from "./demo/DemoBar";
import { Auction } from "./screens/Auction";
import { Close } from "./screens/Close";
import { HowItWorks } from "./screens/HowItWorks";
import { Liquidity } from "./screens/Liquidity";
import { Replay } from "./screens/Replay";
import { MyOrdersProvider } from "./stellar/myOrders";
import { WalletProvider } from "./stellar/wallet";
import "./styles/global.css";
import "./styles/explainer.css";
import { DEMO } from "./config";

if (DEMO) document.body.classList.add("demo");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <WalletProvider>
        <DataProvider>
          <MyOrdersProvider>
            <Routes>
              <Route path="/" element={<Auction />} />
              <Route path="/close" element={<Close />} />
              <Route path="/liquidity" element={<Liquidity />} />
              <Route path="/replay" element={<Replay />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
            </Routes>
            <DemoBar />
          </MyOrdersProvider>
        </DataProvider>
      </WalletProvider>
    </BrowserRouter>
  </StrictMode>,
);
