import "./polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { DataProvider } from "./data/useFathom";
import { DemoBar } from "./demo/DemoBar";
import { AuctionLive } from "./screens/AuctionLive";
import { Close } from "./screens/Close";
import { Trade } from "./screens/Trade";
import { HowItWorks } from "./screens/HowItWorks";
import { Liquidity } from "./screens/Liquidity";
import { Replay } from "./screens/Replay";
import { MyOrdersProvider } from "./stellar/myOrders";
import { WalletProvider } from "./stellar/wallet";
import "./styles/global.css";
import "./styles/explainer.css";


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <WalletProvider>
        <DataProvider>
          <MyOrdersProvider>
            <Routes>
              <Route path="/" element={<Trade />} />
              <Route path="/auction" element={<AuctionLive />} />
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
