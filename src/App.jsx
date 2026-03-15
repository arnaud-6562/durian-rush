import { useState, useEffect } from "react";
import AdminScreen from "./AdminScreen";
import PlayerScreen from "./PlayerScreen";
import DurianRush from "./DurianRush";

function getRoute() {
  const path = window.location.pathname;
  if (path === "/admin") return "admin";
  if (path === "/play") return "play";
  return "demo";
}

export default function App() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const onPop = () => setRoute(getRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (route === "admin") return <AdminScreen />;
  if (route === "play")  return <PlayerScreen />;
  return <DurianRush />;
}
