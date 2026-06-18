"use client";
import { useEffect } from "react";
import Clarity from "@microsoft/clarity";
export default function ClarityAnalytics() {
  useEffect(() => {
    Clarity.init("wlc2wu5s4g");
  }, []);
  return null;
}
