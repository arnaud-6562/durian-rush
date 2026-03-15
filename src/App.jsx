import { useState, useEffect, lazy, Suspense } from "react";

const AdminScreen  = lazy(() => import("./AdminScreen"));
const PlayerScreen = lazy(() => import("./PlayerScreen"));
const DurianRush   = lazy(() => import("./DurianRush"));

function getRoute() {
  const path = window.location.pathname;
  if (path === "/admin") return "admin";
  if (path === "/play") return "play";
  return "demo";
}

/* Full-screen loading spinner while chunks download */
const Loader = () => (
  <div style={{
    display: "flex", alignItems: "center", justifyContent: "center",
    height: "100vh", background: "#0a0a0a", color: "#F59E0B",
    fontFamily: "monospace", fontSize: 18,
  }}>
    Loading…
  </div>
);

export default function App() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const onPop = () => setRoute(getRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <Suspense fallback={<Loader />}>
      {route === "admin" && <AdminScreen />}
      {route === "play"  && <PlayerScreen />}
      {route === "demo"  && <DurianRush />}
    </Suspense>
  );
}
