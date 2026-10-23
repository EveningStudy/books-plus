import ReactDOM from "react-dom/client";
import App from "./App";
import { Overlay } from "./components/Overlay";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  location.hash === "#overlay" ? <Overlay /> : <App />,
);
